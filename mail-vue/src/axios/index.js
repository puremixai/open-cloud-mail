import axios from 'axios'
import { ElMessage } from 'element-plus'
import i18n from '@/i18n/index.js'
import { useSettingStore } from '@/store/setting.js'
import { endSession } from '@/utils/session.js'

const http = axios.create({ baseURL: import.meta.env.VITE_BASE_URL, timeout: 30000 })
http.interceptors.request.use(config => {
    const { lang } = useSettingStore()
    config.sessionToken = localStorage.getItem('token')
    config.headers.Authorization = `${config.sessionToken}`
    config.headers['accept-language'] = lang
    return config
})
const stale = config => config && Object.hasOwn(config, 'sessionToken') && config.sessionToken !== localStorage.getItem('token')
const report = (message, warning = false) => ElMessage({ message, type: warning ? 'warning' : 'error', plain: true, grouping: true })
http.interceptors.response.use(res => {
    if (stale(res.config)) return Promise.reject(new axios.CanceledError('Session changed'))
    const data = res.data
    if (data?.code === 200) return data.data
    if (data?.code === 401) void endSession(res.config.sessionToken)
    if (!res.config?.noMsg) report(data?.message || i18n.global.t('reqFailErrorMsg'), data?.code === 403)
    return Promise.reject(data || new Error('Invalid server response'))
}, error => {
    if (stale(error?.config)) return Promise.reject(new axios.CanceledError('Session changed'))
    if (axios.isCancel(error)) return Promise.reject(error)
    const status = error?.response?.status || error?.status
    if (status === 401) void endSession(error?.config?.sessionToken)
    if (!error?.config?.noMsg) {
        const key = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' ? 'timeoutErrorMsg'
            : error?.message?.includes('Network Error') ? 'networkErrorMsg'
            : error?.response ? 'serverBusyErrorMsg' : 'reqFailErrorMsg'
        report(i18n.global.t(key), status === 403)
    }
    return Promise.reject(error)
})
export default http
