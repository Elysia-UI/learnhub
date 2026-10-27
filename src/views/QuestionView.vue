<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useCommunity } from '../stores/community';
import { timeAgo } from '../services/format';
import { uid } from '../services/storage';
import Icon from '../components/Icon.vue';
import Avatar from '../components/Avatar.vue';
import Markdown from '../components/Markdown.vue';
import EmptyState from '../components/EmptyState.vue';
const store = useCommunity(),
  route = useRoute(),
  answer = ref(''),
  preview = ref(false),
  error = ref(''),
  commentTarget = ref(''),
  answerComment = ref('');
const question = computed(() => store.data.questions.find((q) => q.id === route.params.id));
const answers = computed(() =>
  [...(question.value?.answers || [])].sort(
    (a, b) =>
      Number(b.id === question.value?.acceptedId) - Number(a.id === question.value?.acceptedId) ||
      b.likes.length - a.likes.length,
  ),
);
async function submit() {
  error.value = '';
  if (answer.value.trim().length < 10) return (error.value = '请至少用 10 个字分享你的思路');
  if (!store.requireUser() || !question.value) return;
  try {
    await store.answer(question.value, answer.value);
  } catch (e) {
    error.value = (e as Error).message;
    return;
  }
  answer.value = '';
  preview.value = false;
}
async function sendComment(answerId: string) {
  if (!store.requireUser() || !answerComment.value.trim()) return;
  try {
    await store.answerComment(answerId, answerComment.value.trim());
    answerComment.value = '';
    commentTarget.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <div v-if="question" class="detail-grid">
    <div class="main-column">
      <RouterLink to="/questions" class="back-link"
        ><Icon name="ArrowLeft" :size="17" />返回学习问答</RouterLink
      >
      <article class="panel article-panel question-detail">
        <div class="article-tags">
          <span class="tag" :class="question.acceptedId ? 'tag-green' : 'tag-orange'"
            ><Icon :name="question.acceptedId ? 'CheckCircle2' : 'Clock3'" :size="13" />{{
              question.acceptedId ? '已解决' : '等待你的好答案'
            }}</span
          ><span class="tag tag-blue">{{ store.category(question.category)?.name }}</span>
        </div>
        <h1>{{ question.title }}</h1>
        <div class="article-author">
          <Avatar :user="store.user(question.authorId)" :size="38" />
          <div>
            <strong>{{ store.user(question.authorId).name }}</strong>
            <p>{{ timeAgo(question.createdAt) }}<span>·</span>{{ question.views }} 次阅读</p>
          </div>
          <button
            v-if="question.authorId === store.currentUser?.id"
            class="icon-btn"
            aria-label="编辑问题"
            @click="store.modal = { type: 'question', payload: question }"
          >
            <Icon name="Pencil" :size="18" />
          </button>
        </div>
        <Markdown :content="question.content" />
        <div class="article-tag-list">
          <span v-for="tag in question.tags" :key="tag"># {{ tag }}</span>
        </div>
        <div class="article-actions">
          <a href="#your-answer" class="btn btn-primary"
            ><Icon name="Pencil" :size="17" />我来回答</a
          ><button class="btn btn-secondary" @click="store.favorite(question.favorites)">
            <Icon name="Bookmark" :size="17" />{{
              question.favorites.includes(store.currentUser?.id || '') ? '已收藏' : '收藏问题'
            }}</button
          ><span class="answer-total">{{ question.answers.length }} 个回答</span>
        </div>
      </article>
      <section
        v-for="a in answers"
        :key="a.id"
        class="panel answer-panel"
        :class="{ accepted: question.acceptedId === a.id }"
      >
        <div v-if="question.acceptedId === a.id" class="accepted-banner">
          <Icon name="CheckCircle2" :size="19" />提问者已采纳此回答
        </div>
        <div class="article-author">
          <Avatar :user="store.user(a.authorId)" :size="38" />
          <div>
            <strong>{{ store.user(a.authorId).name }}</strong>
            <p>{{ timeAgo(a.createdAt) }}</p>
          </div>
          <button
            v-if="
              question.authorId === store.currentUser?.id &&
              !question.acceptedId &&
              a.authorId !== question.authorId
            "
            class="btn btn-secondary btn-sm"
            @click="
              store.modal = {
                type: 'confirm',
                payload: {
                  title: '采纳这个回答？',
                  content: '每个问题只能采纳一个最佳答案，采纳后会奖励回答者成长积分。',
                  confirmText: '确认采纳',
                  onConfirm: () => store.accept(question!, a.id),
                },
              }
            "
          >
            <Icon name="CheckCircle2" :size="15" />采纳答案
          </button>
        </div>
        <Markdown :content="a.content" />
        <div class="answer-actions">
          <button
            class="btn btn-secondary btn-sm"
            :class="{ favorited: a.likes.includes(store.currentUser?.id || '') }"
            @click="store.toggle(a.likes)"
          >
            <Icon name="ThumbsUp" :size="16" />赞同 {{ a.likes.length }}</button
          ><button
            class="text-link muted"
            @click="commentTarget = commentTarget === a.id ? '' : a.id"
          >
            <Icon name="MessageSquare" :size="16" />{{ a.comments.length }} 条评论
          </button>
        </div>
        <div v-if="commentTarget === a.id" class="answer-comments">
          <div v-for="c in a.comments" :key="c.id">
            <strong>{{ store.user(c.authorId).name }}</strong>
            <p>{{ c.content }}</p>
          </div>
          <form @submit.prevent="sendComment(a.id)">
            <input
              v-model="answerComment"
              required
              maxlength="2000"
              placeholder="友善地补充你的想法"
              aria-label="回答评论"
            /><button class="btn btn-primary btn-sm">发送</button>
          </form>
        </div>
      </section>
      <section id="your-answer" class="panel your-answer">
        <h2>写下你的回答</h2>
        <p>清晰的思路与真实的经验，比标准答案更有价值。</p>
        <form @submit.prevent="submit">
          <div class="answer-editor-head">
            <span>支持 Markdown 格式</span
            ><button type="button" class="text-link" @click="preview = !preview">
              {{ preview ? '返回编辑' : '预览回答' }}
            </button>
          </div>
          <Markdown v-if="preview" :content="answer || '写下你的想法…'" /><textarea
            v-else
            v-model="answer"
            required
            minlength="10"
            maxlength="30000"
            rows="7"
            aria-label="回答内容"
            placeholder="结合你的理解和实践，帮助 TA 找到答案…"
          ></textarea>
          <p v-if="error" class="form-error">{{ error }}</p>
          <div class="modal-footer">
            <button class="btn btn-primary"><Icon name="Send" :size="17" />发布回答</button>
          </div>
        </form>
      </section>
    </div>
    <aside class="detail-aside">
      <section class="panel writing-tips">
        <h3><Icon name="Sparkles" :size="19" />让好答案被看见</h3>
        <p>先理解问题，再分享思路。</p>
        <ul>
          <li>结合实际经验，给出可操作的建议</li>
          <li>适当补充示例，解释背后的原因</li>
          <li>引用资料时注明出处</li>
          <li>尊重不同观点，保持友善</li>
        </ul>
      </section>
      <section class="panel writing-tips">
        <h3>更多值得思考的问题</h3>
        <RouterLink
          v-for="q in store.data.questions.filter((q) => q.id !== question!.id).slice(0, 3)"
          :key="q.id"
          :to="`/questions/${q.id}`"
          >{{ q.title }}<Icon name="ChevronRight" :size="16"
        /></RouterLink>
      </section>
    </aside>
  </div>
  <section v-else class="panel">
    <EmptyState title="这个问题暂时找不到了"
      ><RouterLink to="/questions" class="btn btn-primary">回到问答</RouterLink></EmptyState
    >
  </section>
</template>
