import http from '@/axios/index.js';

export function oauthLinuxDoLogin(code, redirectUri) {
    return http.post('/oauth/linuxDo/login',{code, redirectUri})
}

export function oauthGithubLogin(code, redirectUri) {
    return http.post('/oauth/github/login',{code, redirectUri})
}

export function oauthGoogleLogin(code, redirectUri) {
    return http.post('/oauth/google/login',{code, redirectUri})
}

export function oauthXaiComplete() {
    return http.post('/oauth/xai/complete')
}

export function oauthXaiBindUser(form) {
    return http.put('/oauth/xai/bindUser', form)
}

export function oauthBindUser(form) {
    return http.put('/oauth/bindUser', form)
}
