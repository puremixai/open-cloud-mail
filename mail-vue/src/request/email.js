import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type, full, options = {}) {
    return http.get('/email/list', {...options, params: {accountId, allReceive, emailId, timeSort, size, type, full, includeTotal: emailId > 0 ? 0 : 1}})
}

export function emailDetail(emailId, options = {}) {
    return http.get('/email/detail', { ...options, params: { emailId } })
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive, options = {}) {
    return http.get('/email/latest', {...options, params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}
