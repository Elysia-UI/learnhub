<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useCommunity } from '../stores/community';
import Icon from '../components/Icon.vue';
import Avatar from '../components/Avatar.vue';
import CourseCover from '../components/CourseCover.vue';
import Markdown from '../components/Markdown.vue';
import EmptyState from '../components/EmptyState.vue';
const store = useCommunity(),
  route = useRoute(),
  activeTab = ref('outline'),
  selected = ref('');
const course = computed(() => store.data.courses.find((c) => c.id === route.params.id));
const enrollment = computed(() => store.progress(course.value?.id || ''));
const progress = computed(() =>
  course.value?.chapters.length
    ? Math.round(((enrollment.value?.completed.length || 0) / course.value.chapters.length) * 100)
    : 0,
);
const chapter = computed(
  () =>
    course.value?.chapters.find((c) => c.id === selected.value) ||
    course.value?.chapters.find((c) => c.id === enrollment.value?.lastChapter) ||
    course.value?.chapters[0],
);
async function learn(chapterId?: string) {
  if (!course.value || !store.requireUser()) return;
  if (!enrollment.value) await store.enroll(course.value);
  selected.value = chapterId || enrollment.value?.lastChapter || course.value.chapters[0]?.id || '';
  activeTab.value = 'learn';
  if (enrollment.value) await store.learnChapter(course.value.id, selected.value);
}
</script>
<template>
  <div v-if="course" class="full-page">
    <RouterLink to="/courses" class="back-link"
      ><Icon name="ArrowLeft" :size="17" />返回课程中心</RouterLink
    >
    <section class="panel course-detail-hero">
      <div class="course-detail-cover"><CourseCover :course="course" /></div>
      <div class="course-detail-info">
        <div class="article-tags">
          <span class="tag tag-blue">{{ store.category(course.category)?.name }}</span
          ><span class="tag tag-purple">{{ course.level }}</span>
        </div>
        <h1>{{ course.title }}</h1>
        <p>{{ course.description }}</p>
        <div class="course-detail-meta">
          <span><Icon name="BookOpen" :size="16" />{{ course.chapters.length }} 个章节</span
          ><span><Icon name="Clock3" :size="16" />{{ course.hours }} 课时</span
          ><span><Icon name="Users" :size="16" />{{ course.enrollmentCount || 0 }} 人加入</span>
        </div>
        <div class="course-hero-bottom">
          <button class="btn btn-primary" @click="learn()">
            <Icon name="Play" :size="17" />{{
              enrollment ? '继续学习' : '加入课程，开始学习'
            }}</button
          ><button
            v-if="course.teacherId === store.currentUser?.id || store.currentUser?.role === 'admin'"
            class="btn btn-secondary"
            @click="store.modal = { type: 'course', payload: course }"
          >
            <Icon name="Pencil" :size="16" />管理课程</button
          ><span class="free-label">社区分享 · 免费学习</span>
        </div>
      </div>
    </section>
    <div class="course-learning-grid">
      <section class="panel course-learning-panel">
        <div class="line-tabs">
          <button :class="{ active: activeTab === 'outline' }" @click="activeTab = 'outline'">
            课程目录</button
          ><button :class="{ active: activeTab === 'about' }" @click="activeTab = 'about'">
            课程介绍</button
          ><button v-if="enrollment" :class="{ active: activeTab === 'learn' }" @click="learn()">
            学习内容
          </button>
        </div>
        <div v-if="activeTab === 'outline'" class="chapter-list">
          <div class="chapter-list-heading">
            <span>循序渐进，学以致用</span><small>共 {{ course.chapters.length }} 节</small>
          </div>
          <button v-for="(c, i) in course.chapters" :key="c.id" @click="learn(c.id)">
            <span class="chapter-index" :class="{ completed: enrollment?.completed.includes(c.id) }"
              ><Icon v-if="enrollment?.completed.includes(c.id)" name="Check" :size="18" /><template
                v-else
                >{{ String(i + 1).padStart(2, '0') }}</template
              ></span
            ><span class="chapter-name">{{ c.title }}<small>图文讲解 · 实践练习</small></span
            ><span class="chapter-duration">{{ c.duration }}</span
            ><Icon name="Play" :size="17" />
          </button>
        </div>
        <div v-else-if="activeTab === 'about'" class="course-about">
          <h2>关于这门课程</h2>
          <Markdown :content="course.description" />
          <h3>你将获得什么</h3>
          <ul>
            <li>结构清晰的学习路径</li>
            <li>贴近实际的练习内容</li>
            <li>可以随时继续的学习进度</li>
          </ul>
          <h3>开始之前</h3>
          <p>保持好奇，预留一段可以专注的时间。遇到问题时，欢迎带着自己的尝试到问答区交流。</p>
          <RouterLink class="btn btn-secondary" to="/questions"
            >去问答区交流<Icon name="ArrowRight" :size="16"
          /></RouterLink>
        </div>
        <div v-else-if="chapter" class="lesson-content">
          <div class="lesson-heading">
            <span class="tag tag-blue"
              >第 {{ course.chapters.findIndex((c) => c.id === chapter!.id) + 1 }} 章</span
            ><span><Icon name="Clock3" :size="14" />{{ chapter.duration }}</span>
          </div>
          <Markdown :content="chapter.content" />
          <div class="lesson-footer">
            <button class="btn btn-secondary" @click="activeTab = 'outline'">返回目录</button
            ><button
              class="btn btn-primary"
              :disabled="enrollment?.completed.includes(chapter.id)"
              @click="store.complete(course, chapter.id)"
            >
              <Icon name="CheckCircle2" :size="17" />{{
                enrollment?.completed.includes(chapter.id) ? '已完成本节' : '标记本节完成'
              }}</button
            ><button
              v-if="
                course.chapters.findIndex((c) => c.id === chapter!.id) < course.chapters.length - 1
              "
              class="btn btn-secondary"
              @click="
                learn(
                  course.chapters[course.chapters.findIndex((c) => c.id === chapter!.id) + 1]!.id,
                )
              "
            >
              下一节<Icon name="ArrowRight" :size="16" />
            </button>
          </div>
        </div>
      </section>
      <aside class="detail-aside">
        <section class="panel progress-card">
          <h3><Icon name="Target" :size="20" />我的学习进度</h3>
          <div class="progress-ring" :style="{ '--progress': progress + '%' }">
            <div>
              <strong>{{ progress }}<small>%</small></strong
              ><span>慢慢来，也很快</span>
            </div>
          </div>
          <p>
            已完成 {{ enrollment?.completed.length || 0 }} / {{ course.chapters.length }} 个章节
          </p>
          <button class="btn btn-primary full" @click="learn()">
            {{ enrollment ? '继续我的学习' : '开启学习之旅' }}<Icon name="ArrowRight" :size="16" />
          </button>
        </section>
        <section class="panel course-teacher">
          <h3>课程分享者</h3>
          <div>
            <Avatar :user="store.user(course.teacherId)" :size="44" /><strong
              >{{ store.user(course.teacherId).name
              }}<span class="tag tag-purple">社区教师</span></strong
            >
          </div>
          <p>{{ store.user(course.teacherId).bio }}</p>
          <RouterLink :to="`/members/${course.teacherId}`" class="text-link"
            >查看个人主页<Icon name="ArrowUpRight" :size="15"
          /></RouterLink>
        </section>
        <div class="gentle-tip">
          <Icon name="Sparkles" :size="22" />
          <p>每一次专注，都会在未来<br />成为你意想不到的收获。</p>
        </div>
      </aside>
    </div>
  </div>
  <section v-else class="panel">
    <EmptyState title="课程暂时找不到了"
      ><RouterLink class="btn btn-primary" to="/courses">浏览其他课程</RouterLink></EmptyState
    >
  </section>
</template>
