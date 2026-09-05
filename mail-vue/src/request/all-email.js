import http from '@/axios/index.js';

export function allEmailList(params, options = {}) {
    return http.get('/allEmail/list', {...options, params: {...params, includeTotal: params.emailId > 0 ? 0 : 1}})
}

export function allEmailDetail(emailId, options = {}) {
    return http.get('/allEmail/detail', { ...options, params: { emailId } })
}

export function allEmailDelete(emailIds) {
    return http.delete('/allEmail/delete?emailIds=' + emailIds)
}

export function allEmailBatchDelete(params) {
    return http.delete('/allEmail/batchDelete', {params: params} )
}

export function allEmailLatest(emailId, options = {}) {
    return http.get('/allEmail/latest', {...options, params: {emailId}, noMsg: true, timeout: 35 * 1000})
}
