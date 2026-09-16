<template>
  <div id="login-box" :style=" background ? 'background: var(--el-bg-color)' : ''" v-loading="oauthLoading" :element-loading-text="$t('ux.signingIn')">
    <div v-if="settingStore.settings.background" class="background-layer" :style="background"></div>
    <div class="form-wrapper">
      <div class="container">
        <span class="form-title">{{ settingStore.siteTitle }}</span>
        <span class="form-desc" v-if="show === 'login'">{{ $t('loginTitle') }}</span>
        <span class="form-desc" v-else>{{ $t('regTitle') }}</span>
        <div v-show="show === 'login'">
          <label class="field-label" for="login-email">{{ $t('emailAccount') }}</label>
          <el-input :aria-invalid="!!fieldErrors['login-email']" :aria-describedby="fieldErrors['login-email'] ? 'login-email-error' : undefined" @input="delete fieldErrors['login-email']" id="login-email" name="login-email" :class="!hideLoginDomain ? 'email-input' : ''" v-model="form.email"
                    type="text" :placeholder="$t('emailAccount')" autocomplete="username" @keyup.enter="submit">
            <template #append v-if="!hideLoginDomain">
              <el-select
                    v-if="show === 'login'"
                    ref="mySelect"
                    v-model="suffix"
                    :placeholder="$t('select')"
                    class="select" :aria-label="$t('ux.domain')"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
            </template>
          </el-input>
          <p v-if="fieldErrors['login-email']" id="login-email-error" class="field-error" role="alert">{{ fieldErrors['login-email'] }}</p>
          <p v-if="form.email" class="email-preview">{{ $t('ux.fullEmail', { email: getFullEmail(form.email) }) }}</p>
          <label class="field-label" for="login-password">{{ $t('password') }}</label>
          <el-input :aria-invalid="!!fieldErrors['login-password']" :aria-describedby="fieldErrors['login-password'] ? 'login-password-error' : undefined" @input="delete fieldErrors['login-password']" id="login-password" name="login-password" v-model="form.password" :placeholder="$t('password')" type="password" show-password autocomplete="current-password" @keyup.enter="submit">
          </el-input>
          <p v-if="fieldErrors['login-password']" id="login-password-error" class="field-error" role="alert">{{ fieldErrors['login-password'] }}</p>
          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading"
          >{{ $t('loginBtn') }}
          </el-button>
          <el-button v-for="p in oauthProviders" :key="p.key" class="btn" style="margin-top: 10px" @click="oauthLogin(p.key)">
            <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="18" style="margin-right: 10px" />
            <Icon v-else :icon="p.icon" width="18" height="18" style="margin-right: 10px" />
            {{ p.label }}
          </el-button>
        </div>
        <div v-show="show !== 'login'">
          <label class="field-label" for="register-email">{{ $t('emailAccount') }}</label>
          <el-input :aria-invalid="!!fieldErrors['register-email']" :aria-describedby="fieldErrors['register-email'] ? 'register-email-error' : undefined" @input="delete fieldErrors['register-email']" id="register-email" name="register-email" :class="!hideLoginDomain ? 'email-input' : ''" v-model="registerForm.email" type="text" :placeholder="$t('emailAccount')"
                    autocomplete="username" @keyup.enter="submitRegister">
            <template #append v-if="!hideLoginDomain">
              <el-select
                    v-if="show !== 'login'"
                    ref="mySelect"
                    v-model="suffix"
                    :placeholder="$t('select')"
                    class="select" :aria-label="$t('ux.domain')"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
            </template>
          </el-input>
          <p v-if="fieldErrors['register-email']" id="register-email-error" class="field-error" role="alert">{{ fieldErrors['register-email'] }}</p>
          <p v-if="registerForm.email" class="email-preview">{{ $t('ux.fullEmail', { email: getFullEmail(registerForm.email) }) }}</p>
          <label class="field-label" for="register-password">{{ $t('password') }}</label>
          <el-input :aria-invalid="!!fieldErrors['register-password']" :aria-describedby="fieldErrors['register-password'] ? 'register-password-error' : undefined" @input="delete fieldErrors['register-password']" id="register-password" name="register-password" v-model="registerForm.password" :placeholder="$t('password')" type="password" show-password autocomplete="new-password" @keyup.enter="submitRegister"/>
          <p v-if="fieldErrors['register-password']" id="register-password-error" class="field-error" role="alert">{{ fieldErrors['register-password'] }}</p>
          <label class="field-label" for="register-confirm">{{ $t('confirmPwd') }}</label>
          <el-input :aria-invalid="!!fieldErrors['register-confirm']" :aria-describedby="fieldErrors['register-confirm'] ? 'register-confirm-error' : undefined" @input="delete fieldErrors['register-confirm']" id="register-confirm" name="register-confirm" v-model="registerForm.confirmPassword" :placeholder="$t('confirmPwd')" type="password" show-password
                    autocomplete="new-password" @keyup.enter="submitRegister"/>
          <p v-if="fieldErrors['register-confirm']" id="register-confirm-error" class="field-error" role="alert">{{ fieldErrors['register-confirm'] }}</p>
          <label v-if="settingStore.settings.regKey === 0" class="field-label" for="register-code">{{ $t('regKey') }}</label>
          <el-input :aria-invalid="!!fieldErrors['register-code']" :aria-describedby="fieldErrors['register-code'] ? 'register-code-error' : undefined" @input="delete fieldErrors['register-code']" id="register-code" v-if="settingStore.settings.regKey === 0" v-model="registerForm.code" :placeholder="$t('regKey')"
                    type="text" autocomplete="off" @keyup.enter="submitRegister"/>
          <p v-if="fieldErrors['register-code']" id="register-code-error" class="field-error" role="alert">{{ fieldErrors['register-code'] }}</p>
          <label v-if="settingStore.settings.regKey === 2" class="field-label" for="register-code-optional">{{ $t('regKeyOptional') }}</label>
          <el-input :aria-invalid="!!fieldErrors['register-code-optional']" :aria-describedby="fieldErrors['register-code-optional'] ? 'register-code-optional-error' : undefined" @input="delete fieldErrors['register-code-optional']" id="register-code-optional" v-if="settingStore.settings.regKey === 2" v-model="registerForm.code"
                    :placeholder="$t('regKeyOptional')" type="text" autocomplete="off" @keyup.enter="submitRegister"/>
          <p v-if="fieldErrors['register-code-optional']" id="register-code-optional-error" class="field-error" role="alert">{{ fieldErrors['register-code-optional'] }}</p>
          <div v-show="verifyShow"
               class="register-turnstile"
               :data-sitekey="settingStore.settings.siteKey"
               data-callback="onTurnstileSuccess"
               data-error-callback="onTurnstileError"
               data-after-interactive-callback="loadAfter"
               data-before-interactive-callback="loadBefore"
          >
            <span style="font-size: 12px;color: #F56C6C" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
          </div>
          <el-button class="btn" style="margin: 0" type="primary" @click="submitRegister" :loading="registerLoading"
          >{{ $t('regBtn') }}
          </el-button>
          <el-button v-for="p in oauthProviders" :key="p.key" class="btn" style="margin-top: 10px" @click="oauthLogin(p.key)">
            <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="18" style="margin-right: 10px" />
            <Icon v-else :icon="p.icon" width="18" height="18" style="margin-right: 10px" />
            {{ p.label }}
          </el-button>
        </div>
        <template v-if="settingStore.settings.register === 0">
          <button type="button" class="switch" @click="switchForm('register')" v-if="show === 'login'">{{ $t('noAccount') }}
            <span>{{ $t('regSwitch') }}</span></button>
          <button type="button" class="switch" @click="switchForm('login')" v-else>{{ $t('hasAccount') }} <span>{{ $t('loginSwitch') }}</span>
          </button>
        </template>
      </div>
    </div>
    <el-dialog class="bind-dialog" v-model="showBindForm"  :title="$t('ux.bindEmail')" >
      <div class="bind-container">
        <label class="field-label" for="bind-email">{{ $t('emailAccount') }}</label>
          <el-input :aria-invalid="!!fieldErrors['bind-email']" :aria-describedby="fieldErrors['bind-email'] ? 'bind-email-error' : undefined" @input="delete fieldErrors['bind-email']" id="bind-email" name="bind-email" :class="!hideLoginDomain ? 'email-input' : ''" v-model="bindForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="username" @keyup.enter="bind">
          <template #append v-if="!hideLoginDomain">
            <el-select
                  ref="mySelect"
                  v-model="suffix"
                  :placeholder="$t('select')"
                  class="select" :aria-label="$t('ux.domain')"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
          </template>
        </el-input>
          <p v-if="fieldErrors['bind-email']" id="bind-email-error" class="field-error" role="alert">{{ fieldErrors['bind-email'] }}</p>
        <label v-if="bindRegistrationKeyPolicy.visible" for="bind-code">{{ $t(bindRegistrationKeyPolicy.required ? 'regKey' : 'regKeyOptional') }}</label>
        <el-input :aria-invalid="!!fieldErrors['bind-code']" :aria-describedby="fieldErrors['bind-code'] ? 'bind-code-error' : undefined" @input="delete fieldErrors['bind-code']" id="bind-code" v-if="bindRegistrationKeyPolicy.visible" v-model="bindForm.code"
                  :placeholder="$t(bindRegistrationKeyPolicy.required ? 'regKey' : 'regKeyOptional')"
                  type="text" autocomplete="off" @keyup.enter="bind"/>
          <p v-if="fieldErrors['bind-code']" id="bind-code-error" class="field-error" role="alert">{{ fieldErrors['bind-code'] }}</p>
        <el-button class="btn" type="primary" @click="bind" :loading="bindLoading"
        >{{ $t('ux.bind') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import router from "@/router";
import {useRoute} from "vue-router";
import {computed, nextTick, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {register} from "@/request/login.js";
import {websiteConfig} from "@/request/setting.js";
import {getRegistrationKeyPolicy, isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {useUiStore} from "@/store/ui.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import {useI18n} from "vue-i18n";
import {
  oauthBindUser,
  oauthGithubLogin,
  oauthGoogleLogin,
  oauthLinuxDoLogin,
  oauthXaiBindUser,
  oauthXaiComplete,
} from "@/request/ouath.js";

const {t} = useI18n();
const accountStore = useAccountStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const settingStore = useSettingStore();
const route = useRoute();
const loginLoading = ref(false)
const bindLoading = ref(false)
const oauthLoading = ref(false);
const showBindForm = ref(false);
const fieldErrors = reactive({})
function invalidField(id, message) {
  fieldErrors[id] = message
  nextTick(() => document.getElementById(id)?.focus())
}
const show = ref('login')
async function switchForm(value) {
  show.value = value
  await nextTick()
  document.getElementById(value === 'login' ? 'login-email' : 'register-email')?.focus()
}

const oauthKeys = ['linuxdo', 'github', 'google']

const oauthProvider = computed(() => {
  const fromState = route.query.state
  if (oauthKeys.includes(fromState)) return fromState
  const fromStore = sessionStorage.getItem('oauthProvider')
  return oauthKeys.includes(fromStore) ? fromStore : null
})

const oauthProviders = computed(() => {
  const allProviders = [
    { key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify' },
    { key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify' },
    { key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image' },
    { key: 'xai', label: 'XAI', icon: 'mdi:robot-outline', iconType: 'iconify' },
  ]
  return allProviders.filter(p => settingStore.settings[p.key + 'Switch'] === 0)
})

const bindForm = reactive({
  email: '',
  oauthUserId: '',
  oauthPlatform: '',
  code: ''
})

const bindRegistrationKeyPolicy = computed(() => getRegistrationKeyPolicy(
    settingStore.settings.regKey,
    bindForm.oauthPlatform,
))

const form = reactive({
  email: '',
  password: '',

});
const mySelect = ref()
const suffix = ref('')
const registerForm = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  code: null
})
const domainList = settingStore.domainList;
const registerLoading = ref(false)
suffix.value = domainList[0]
const verifyShow = ref(false)
let verifyToken = ''
let turnstileId = null
let botJsError = ref(false)
let verifyErrorCount = 0

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  console.warn('人机验加载失败', e)
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.register-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.loadAfter = (e) => {
  console.log('loadAfter')
}

window.loadBefore = (e) => {
  console.log('loadBefore')
}

const loginOpacity = computed(() => {
  const opacity = settingStore.settings.loginOpacity
  return uiStore.dark ? `rgba(0, 0, 0, ${opacity})` : `rgba(255, 255, 255, ${opacity})`
})

const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)

const background = computed(() => {

  return settingStore.settings.background ? {
    'background-image': `url(${cvtR2Url(settingStore.settings.background)})`,
    'background-repeat': 'no-repeat',
    'background-size': 'cover',
    'background-position': 'center'
  } : ''
})

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const getFullEmail = (email) => {
  return hideLoginDomain.value ? email : email + suffix.value
}

const getEmailName = (email) => {
  return email.split('@')[0]
}

function oauthLogin(provider) {
  if (provider === 'xai') {
    window.location.href = `${window.location.origin}/api/oauth/xai/start`
    return
  }

  const clientId = settingStore.settings[provider + 'ClientId']
  const redirectUri = encodeURIComponent(window.location.origin + '/login')
  sessionStorage.setItem('oauthProvider', provider)
  const authorizeUrls = {
    linuxdo: `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
    github: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&state=${provider}`,
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
  }
  window.location.href = authorizeUrls[provider]
}

const loginFns = {
  linuxdo: oauthLinuxDoLogin,
  github: oauthGithubLogin,
  google: oauthGoogleLogin,
}

oauthGetUser();

async function oauthGetUser() {

  const params = new URLSearchParams(window.location.search)
  if (params.get('oauth') === 'xai') {
    bindForm.oauthPlatform = 'xai'
    oauthLoading.value = true
    const error = params.get('error')
    window.history.replaceState({}, '', window.location.origin + window.location.pathname)

    if (error) {
      const messages = {
        access_denied: '已取消 XAI 授权',
        account_unavailable: 'XAI 账号当前不可登录',
        provider_error: 'XAI 授权服务返回错误',
        verification_failed: 'XAI 登录验证失败，请重试',
      }
      ElMessage({
        message: messages[error] || 'XAI 登录失败，请重试',
        type: 'error',
        plain: true,
      })
      oauthLoading.value = false
      return
    }

    try {
      const data = await oauthXaiComplete()
      handleOauthLoginResult(data, 'xai')
    } catch {
      oauthLoading.value = false
    }
    return
  }

  const code = params.get('code')
  if (!code || !oauthProvider.value) return

  const provider = oauthProvider.value
  bindForm.oauthPlatform = provider
  oauthLoading.value = true
  sessionStorage.removeItem('oauthProvider')
  window.history.replaceState({}, '', window.location.origin + window.location.pathname)

  loginFns[provider](code, window.location.origin + '/login').then(data => {
    handleOauthLoginResult(data, provider)
  }).catch(() => {
    oauthLoading.value = false
  })
}

function handleOauthLoginResult(data, provider) {
  bindForm.oauthPlatform = provider
  bindForm.oauthUserId = data.userInfo?.oauthUserId || ''

  if (!data.token) {
    showBindForm.value = true
    oauthLoading.value = false
    ElMessage({
      message: '请注册绑定一个邮箱',
      type: 'warning',
      duration: 4000,
      plain: true,
    })
    return
  }

  saveToken(data.token)
}

function bind() {

  if (bindLoading.value) return

  if (!bindForm.email) {
    invalidField('bind-email', t('emptyEmailMsg'))
    return
  }


  if (getEmailName(bindForm.email).length < settingStore.settings.minEmailPrefix) {
    invalidField('bind-email', t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}))
    return
  }

  let email = getFullEmail(bindForm.email);


  if (!isEmail(email)) {
    invalidField('bind-email', t('notEmailMsg'))
    return
  }

  if (bindRegistrationKeyPolicy.value.required) {

    if (!bindForm.code) {

      invalidField('bind-code', t('emptyRegKeyMsg'))
      return
    }

  }

  const form = {
    email,
    oauthUserId: bindForm.oauthUserId,
    oauthPlatform: bindForm.oauthPlatform,
    code: bindForm.code,
  }

  bindLoading.value = true
  const isXai = bindForm.oauthPlatform === 'xai'
  const bindRequest = isXai ? oauthXaiBindUser : oauthBindUser
  const bindPayload = isXai ? {email, code: bindForm.code} : form
  bindRequest(bindPayload).then(data => {
    saveToken(data.token)
  }).catch(() => {
    bindLoading.value = false
  })
}

const submit = () => {

  if (loginLoading.value) return

  if (!form.email) {
    invalidField('login-email', t('emptyEmailMsg'))
    return
  }

  let email = getFullEmail(form.email);

  if (!isEmail(email)) {
    invalidField('login-email', t('notEmailMsg'))
    return
  }

  if (!form.password) {
    invalidField('login-password', t('emptyPwdMsg'))
    return
  }

  loginLoading.value = true
  login(email, form.password).then(async data => {
    await saveToken(data.token)
  }).finally(() => {
    loginLoading.value = false
  })
}

async function saveToken(token) {
  localStorage.setItem('token', token)
  refreshWebsiteConfig()
  const user = await loginUserInfo();
  accountStore.currentAccountId = user.account.accountId;
  accountStore.currentAccount = user.account;
  userStore.user = user;
  const routers = permsToRouter(user.permKeys);
  routers.forEach(routerData => {
    router.addRoute('layout', routerData);
  });
  await router.replace({name: 'layout'})
  uiStore.showNotice()
  oauthLoading.value = false;
  bindLoading.value = false;
}

function refreshWebsiteConfig() {
  websiteConfig().then(setting => {
    settingStore.settings = setting
    settingStore.domainList = setting.domainList
    if (!suffix.value && setting.domainList.length > 0) {
      suffix.value = setting.domainList[0]
    }
    document.title = settingStore.siteTitle
  }).catch(e => {
    console.error(e)
  })
}


function submitRegister() {

  if (registerLoading.value) return

  if (!registerForm.email) {
    invalidField('register-email', t('emptyEmailMsg'))
    return
  }


  if (getEmailName(registerForm.email).length < settingStore.settings.minEmailPrefix) {
    invalidField('register-email', t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}))
    return
  }

  const email = getFullEmail(registerForm.email);

  if (!isEmail(email)) {
    invalidField('register-email', t('notEmailMsg'))
    return
  }

  if (!registerForm.password) {
    invalidField('register-password', t('emptyPwdMsg'))
    return
  }

  if (registerForm.password.length < 6) {
    invalidField('register-password', t('pwdLengthMsg'))
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {

    invalidField('register-confirm', t('confirmPwdFailMsg'))
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!registerForm.code) {

      invalidField('register-code', t('emptyRegKeyMsg'))
      return
    }

  }

  if (!verifyToken && (settingStore.settings.registerVerify === 0 || (settingStore.settings.registerVerify === 2 && settingStore.settings.regVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.register-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
          }
        } else {
          window.turnstile.reset('.register-turnstile')
        }
      })
    } else if (!botJsError.value) {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  registerLoading.value = true

  const form = {
    email,
    password: registerForm.password,
    token: verifyToken,
    code: registerForm.code
  }

  register(form).then(({regVerifyOpen}) => {
    show.value = 'login'
    registerForm.email = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    registerForm.code = ''
    registerLoading.value = false
    verifyToken = ''
    settingStore.settings.regVerifyOpen = regVerifyOpen
    verifyShow.value = false
    ElMessage({
      message: t('regSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).catch(res => {

    registerLoading.value = false

    if (res.code === 400) {
      verifyToken = ''
      settingStore.settings.regVerifyOpen = true
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.register-turnstile')
        })
      }
      verifyShow.value = true

    }
  });
}

</script>


<style>
.el-select-dropdown__item {
  padding: 0 15px;
}

.no-autofill-pwd {
  .el-input__inner {
    -webkit-text-security: disc !important;
  }
}
</style>

<style lang="scss" scoped>

.background-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
}

.field-error { margin: -10px 0 16px; color: var(--el-color-danger); font-size: 13px; }
.field-label { display: block; margin: 0 0 6px; font-weight: 500; }
.email-preview { margin: -10px 0 16px; color: var(--regular-text-color); overflow-wrap: anywhere; font-size: 12px; }
.switch { display: block; width: 100%; min-height: 32px; color: var(--el-text-color-primary); cursor: pointer; }
@media (pointer: coarse) { .container .el-input, .container .btn { min-height: 44px; } .container :deep(.el-input__inner) { font-size: 16px; } }

.form-wrapper {
  position: relative;
  width: 100%;
  min-height: 100%;
  padding-block: 24px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.container {
  background: v-bind(loginOpacity);
  padding: 30px 40px 25px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 450px;
  height: fit-content;
  border: 1px solid var(--login-border);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  @media (max-width: 1024px) {
    padding: 20px 18px;
    width: 384px;
  }
  @media (max-width: 767px) {
    padding: 20px 18px;
    width: 100%;
    margin-right: 18px;
    margin-left: 18px;
  }

  .btn {
    height: 36px;
    width: 100%;
    border-radius: 6px;
  }

  .form-desc {
    margin-top: 5px;
    margin-bottom: 18px;
    color: var(--form-desc-color);
  }

  .form-title {
    font-weight: bold;
    font-size: 22px !important;
  }

  .switch {
    margin-top: 20px;
    text-align: center;

    span {
      color: var(--login-switch-color);
      cursor: pointer;
    }
  }

  :deep(.el-input__wrapper) {
    border-radius: 6px;
    background: var(--el-bg-color);
  }

  .email-input :deep(.el-input__wrapper) {
    border-radius: 6px 0 0 6px;
    background: var(--el-bg-color);
  }

  .el-input {
    height: 38px;
    width: 100%;
    margin-bottom: 18px;

    :deep(.el-input__inner) {
      height: 36px;
    }
  }
}

:deep(.el-select-dropdown__item) {
  padding: 0 10px;
}

:deep(.bind-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.bind-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  background: var(--el-bg-color);
  border-radius: 0 8px 8px 0;
}

.email-input :deep(.el-input-group__append .el-select) {
  margin: 0;
  height: 100%;
}
.email-input :deep(.el-select__wrapper) { min-height: 100%; }

:deep(.el-button+.el-button) {
  margin: 0;
}

.register-turnstile {
  margin-bottom: 18px;
}

.select {
  width: 132px;
}

.custom-style {
  margin-bottom: 10px;
}

.custom-style .el-segmented {
  --el-border-radius-base: 6px;
  width: 180px;
}


#login-box {
  background: linear-gradient(to bottom, #2980b9, #6dd5fa, #fff);
  font: 100% Arial, sans-serif;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr;
}

</style>
