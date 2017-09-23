import utils from '../../utils';
import store from '../../../store';

let clientId = 'cbf0cf25cfd026be23e1';
if (utils.origin === 'https://stackedit.io') {
  clientId = '30c1491057c9ad4dbd56';
}
const getScopes = token => [token.repoFullAccess ? 'repo' : 'public_repo', 'gist'];

const request = (token, options) => utils.request({
  ...options,
  headers: {
    ...options.headers,
    Authorization: `token ${token.accessToken}`,
  },
});

const base64Encode = str => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
  (match, p1) => String.fromCharCode(`0x${p1}`),
));
const base64Decode = str => decodeURIComponent(atob(str).split('').map(
  c => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`,
).join(''));

export default {
  startOauth2(scopes, sub = null, silent = false) {
    return utils.startOauth2(
      'https://github.com/login/oauth/authorize', {
        client_id: clientId,
        scope: scopes.join(' '),
      }, silent)
      // Exchange code with token
      .then(data => utils.request({
        method: 'GET',
        url: 'oauth2/githubToken',
        params: {
          clientId,
          code: data.code,
        },
      })
        .then(res => res.body))
      // Call the user info endpoint
      .then(accessToken => utils.request({
        method: 'GET',
        url: 'https://api.github.com/user',
        params: {
          access_token: accessToken,
        },
      })
        .then((res) => {
          // Check the returned sub consistency
          if (sub && res.body.id !== sub) {
            throw new Error('GitHub account ID not expected.');
          }
          // Build token object including scopes and sub
          const token = {
            scopes,
            accessToken,
            name: res.body.name,
            sub: res.body.id,
            repoFullAccess: scopes.indexOf('repo') !== -1,
          };
          // Add token to githubTokens
          store.dispatch('data/setGithubToken', token);
          return token;
        }));
  },
  addAccount(repoFullAccess = false) {
    return this.startOauth2(getScopes({ repoFullAccess }));
  },
  uploadFile(token, owner, repo, branch, path, content, sha) {
    return request(token, {
      method: 'PUT',
      url: `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`,
      body: {
        message: 'Uploaded by https://stackedit.io/',
        content: base64Encode(content),
        sha,
        branch,
      },
    });
  },
  downloadFile(token, owner, repo, branch, path) {
    return request(token, {
      url: `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`,
      params: { ref: branch },
    })
      .then(res => ({
        sha: res.body.sha,
        content: base64Decode(res.body.content),
      }));
  },
  uploadGist(token, description, filename, content, isPublic, gistId) {
    return request(token, gistId ? {
      method: 'PATCH',
      url: `https://api.github.com/gists/${gistId}`,
      body: {
        description,
        files: {
          [filename]: {
            content,
          },
        },
      },
    } : {
      method: 'POST',
      url: 'https://api.github.com/gists',
      body: {
        description,
        files: {
          [filename]: {
            content,
          },
        },
        public: isPublic,
      },
    })
      .then(res => res.body);
  },
  downloadGist(token, gistId, filename) {
    return request(token, {
      url: `https://api.github.com/gists/${gistId}`,
    })
      .then((res) => {
        const result = res.body.files[filename];
        if (!result) {
          throw new Error('Gist file not found.');
        }
        return result.content;
      });
  },
};