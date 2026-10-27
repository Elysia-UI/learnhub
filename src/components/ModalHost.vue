<script setup lang="ts">
import { useModalController } from './useModalController';
import Icon from './Icon.vue';
import Avatar from './Avatar.vue';
import Markdown from './Markdown.vue';
const {
  store,
  form,
  register,
  busy,
  error,
  file,
  fileData,
  chapters,
  modalTitle,
  close,
  chooseFile,
  submit,
  uid,
} = useModalController();
</script>
<template>
  <Teleport to="body"
    ><Transition name="modal"
      ><div v-if="store.modal" class="modal-overlay" @mousedown.self="close">
        <section
          class="modal-dialog"
          :class="{ wide: store.modal.type === 'course' }"
          role="dialog"
          aria-modal="true"
          :aria-label="modalTitle"
          @keydown.esc="close"
        >
          <div class="modal-heading">
            <h2>{{ modalTitle }}</h2>
            <button class="icon-btn" aria-label="关闭弹窗" @click="close"><Icon name="X" /></button>
          </div>
          <div class="modal-body">
            <template v-if="store.modal.type === 'login'">
              <p class="form-hint">用一个好问题、一份真实分享，开启今天的成长。</p>
              <form @submit.prevent="submit">
                <label v-if="register" class="field"
                  >昵称<input
                    v-model="form.name"
                    required
                    minlength="2"
                    maxlength="30"
                    autocomplete="nickname"
                    placeholder="给自己起个好听的名字"
                /></label>
                <label class="field"
                  >邮箱<input
                    v-model="form.email"
                    type="email"
                    required
                    maxlength="190"
                    autocomplete="username"
                    placeholder="你的登录邮箱"
                /></label>
                <label class="field"
                  >密码<input
                    v-model="form.password"
                    type="password"
                    required
                    :minlength="register ? 12 : 1"
                    maxlength="128"
                    :autocomplete="register ? 'new-password' : 'current-password'"
                    placeholder="请输入密码"
                /></label>
                <p v-if="register" class="form-hint">
                  密码至少 12 位，包含字母和数字。新注册用户默认为学生。
                </p>
                <p v-if="error" class="form-error" role="alert">{{ error }}</p>
                <button class="btn btn-primary full" :disabled="busy">
                  <Icon v-if="busy" name="LoaderCircle" class="spin" :size="17" />{{
                    busy ? '正在验证…' : register ? '注册并登录' : '登录社区'
                  }}
                </button>
                <p class="form-bottom">
                  {{ register ? '已经有账号？' : '还没有账号？'
                  }}<button
                    type="button"
                    class="text-link"
                    :disabled="busy"
                    @click="
                      register = !register;
                      error = '';
                      form.password = '';
                      form.name = '';
                    "
                  >
                    {{ register ? '前往登录' : '注册账号' }}
                  </button>
                </p>
              </form> </template
            ><template v-else-if="store.modal.type === 'notice'"
              ><div class="notice-modal-meta">
                <span class="tag tag-blue">{{ store.modal.payload.type }}</span
                ><span>LearnHub 社区运营</span>
              </div>
              <Markdown :content="store.modal.payload.content" /></template
            ><template v-else-if="store.modal.type === 'about'"
              ><div class="about-mark"><Icon name="BookOpen" :size="42" /></div>
              <h3 class="text-center">让知识流动，让成长发生</h3>
              <p class="about-description">
                LearnHub ·
                知学社区，是一个聚焦学习交流、资源共享和共同成长的教育社区。每一个问题、每一次分享，都让学习多一种可能。
              </p>
              <div class="preview-info">
                <Icon name="CircleAlert" :size="20" /><span
                  >在交流中发现新思路，在实践中积累真本领。每一次认真分享，都能成为另一个人的学习灵感。</span
                >
              </div></template
            ><template v-else-if="store.modal.type === 'confirm'"
              ><p class="confirm-text">{{ store.modal.payload.content }}</p>
              <p v-if="error" class="form-error">{{ error }}</p>
              <div class="modal-footer">
                <button class="btn btn-secondary" @click="close">取消</button
                ><button class="btn btn-danger" :disabled="busy" @click="submit">
                  {{ store.modal.payload.confirmText || '确认删除' }}
                </button>
              </div></template
            >
            <form v-else @submit.prevent="submit">
              <template v-if="store.modal.type === 'profile'"
                ><div class="avatar-edit">
                  <Avatar
                    :user="
                      fileData ? { ...store.currentUser!, avatar: fileData } : store.currentUser
                    "
                    :size="72"
                  /><label class="btn btn-secondary"
                    >更换头像<input
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      @change="chooseFile"
                  /></label>
                </div>
                <label class="field"
                  >昵称<input v-model="form.name" required minlength="2" maxlength="20" /></label
                ><label class="field"
                  >个人简介<textarea
                    v-model="form.bio"
                    maxlength="160"
                  ></textarea></label></template
              ><template v-else
                ><label class="field"
                  >{{
                    store.modal.type === 'question'
                      ? '问题标题'
                      : store.modal.type === 'course'
                        ? '课程名称'
                        : '资源名称'
                  }}<input
                    v-model="form.title"
                    required
                    maxlength="100"
                    :placeholder="
                      store.modal.type === 'question'
                        ? '描述清楚的问题，更容易得到好的回答'
                        : '简洁清晰，让大家更容易发现'
                    "
                /></label>
                <div class="form-row">
                  <label class="field"
                    >所属分类<select v-model="form.category">
                      <option v-for="c in store.data.categories" :key="c.id" :value="c.id">
                        {{ c.name }}
                      </option>
                    </select></label
                  ><label v-if="store.modal.type !== 'course'" class="field"
                    >标签<input
                      v-model="form.tags"
                      maxlength="100"
                      placeholder="用逗号分隔，最多 5 个" /></label
                  ><label v-else class="field"
                    >课程难度<select v-model="form.level">
                      <option>入门</option>
                      <option>进阶</option>
                      <option>通用</option>
                    </select></label
                  >
                </div>
                <label v-if="store.modal.type === 'course'" class="field"
                  >副标题<input
                    v-model="form.subtitle"
                    required
                    maxlength="50"
                    placeholder="一句话介绍课程价值" /></label
                ><label class="field"
                  >{{
                    store.modal.type === 'question'
                      ? '问题描述'
                      : store.modal.type === 'course'
                        ? '课程简介'
                        : '资源介绍'
                  }}<textarea
                    v-model="form.content"
                    required
                    minlength="10"
                    maxlength="20000"
                    rows="5"
                    :placeholder="
                      store.modal.type === 'question'
                        ? '补充背景、已经尝试的方法和具体困惑，支持 Markdown'
                        : '介绍内容、适用人群和使用方式'
                    "
                  ></textarea></label
                ><template v-if="store.modal.type === 'upload'"
                  ><label class="upload-zone"
                    ><input
                      type="file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.png,.jpg,.jpeg,.webp,.gif,.md,.txt,.csv"
                      @change="chooseFile"
                    /><Icon :name="file ? 'CheckCircle2' : 'Upload'" :size="30" /><strong>{{
                      busy ? '正在读取文件…' : file?.name || '点击选择要分享的文件'
                    }}</strong
                    ><small>支持文档、图片和压缩包 · 最大 10 MB</small></label
                  >
                  <p class="form-hint">
                    提交后进入待审核列表。审核通过后，其他用户可以浏览和下载。
                  </p></template
                ><template v-if="store.modal.type === 'course'"
                  ><label class="field"
                    >总课时<input v-model="form.hours" type="number" min="1" max="500" required
                  /></label>
                  <div class="chapter-form-head">
                    <strong>课程章节</strong
                    ><button
                      type="button"
                      class="text-link"
                      @click="chapters.push({ id: uid('chapter'), title: '', content: '' })"
                    >
                      <Icon name="Plus" :size="15" />添加章节
                    </button>
                  </div>
                  <div v-for="(chapter, i) in chapters" :key="i" class="chapter-form">
                    <div>
                      <label class="field"
                        >第 {{ i + 1 }} 章<input
                          v-model="chapter.title"
                          required
                          maxlength="80"
                          placeholder="章节标题" /></label
                      ><button
                        v-if="chapters.length > 1"
                        type="button"
                        class="icon-btn"
                        aria-label="删除章节"
                        @click="chapters.splice(i, 1)"
                      >
                        <Icon name="Trash2" :size="17" />
                      </button>
                    </div>
                    <label class="field"
                      >章节正文<textarea
                        v-model="chapter.content"
                        required
                        rows="4"
                        maxlength="30000"
                        placeholder="支持 Markdown，请填写真实的课程内容"
                      ></textarea>
                    </label></div></template
              ></template>
              <p v-if="error" class="form-error" role="alert">{{ error }}</p>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" :disabled="busy" @click="close">
                  取消</button
                ><button class="btn btn-primary" :disabled="busy || store.pending > 0">
                  <Icon v-if="busy" name="LoaderCircle" class="spin" :size="16" />{{
                    store.modal.type === 'question'
                      ? '发布问题'
                      : store.modal.type === 'upload'
                        ? '提交资源'
                        : '保存修改'
                  }}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div></Transition
    ></Teleport
  >
</template>
