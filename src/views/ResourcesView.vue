<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCommunity } from '../stores/community';
import { usePaged } from '../services/paged';
import Icon from '../components/Icon.vue';
import ResourceCard from '../components/ResourceCard.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
const store = useCommunity(),
  category = ref('all'),
  keyword = ref(''),
  type = ref('全部格式'),
  sort = ref('最新发布'),
  unusedPage = ref(1);
const {
  items: resources,
  total,
  page,
  loading,
  error,
  load,
} = usePaged<import('../data/types').Resource>(
  () =>
    '/resources?' +
    new URLSearchParams({
      category: category.value,
      q: keyword.value,
      format: type.value === '全部格式' ? '' : type.value,
      sort: sort.value === '下载最多' ? 'hot' : 'latest',
    }),
  [category, keyword, type, sort],
  'resources',
);
</script>
<template>
  <div class="full-page">
    <div class="page-intro">
      <div>
        <div class="eyebrow">KNOWLEDGE, SHARED / 学习资源</div>
        <h1>好资源，让学习事半功倍<span class="title-dot">.</span></h1>
        <p>每一份认真整理的资料，都能为另一个人的成长助力。</p>
      </div>
      <button
        class="btn btn-primary"
        @click="store.requireUser() && (store.modal = { type: 'upload' })"
      >
        <Icon name="Upload" :size="17" />分享资源
      </button>
    </div>
    <div class="resource-hero">
      <div class="resource-hero-copy">
        <span class="tag tag-green">知识因分享而丰盛</span>
        <h2>你的宝藏资料<br />也是别人的学习起点。</h2>
        <p>学习笔记 / 实战清单 / 设计模板 / 备考指南</p>
      </div>
      <div class="resource-stack">
        <span class="stack-file stack-one"
          ><Icon name="FileText" :size="49" /><small>NOTES</small></span
        ><span class="stack-file stack-two"
          ><Icon name="FileCode" :size="49" /><small>CODE</small></span
        ><span class="stack-file stack-three"
          ><Icon name="FileSpreadsheet" :size="49" /><small>IDEAS</small></span
        ><i class="resource-spark">✦</i>
      </div>
    </div>
    <div class="category-pills">
      <button :class="{ active: category === 'all' }" @click="category = 'all'">全部资源</button
      ><button
        v-for="c in store.data.categories.filter((c) => c.enabled !== false)"
        :key="c.id"
        :class="{ active: category === c.id }"
        @click="category = c.id"
      >
        {{ c.name }}
      </button>
    </div>
    <div class="content-toolbar">
      <h2>
        资源发现<span>{{ total }} 份精选内容</span>
      </h2>
      <div>
        <label class="inline-search"
          ><Icon name="Search" :size="16" /><input
            v-model="keyword"
            aria-label="搜索学习资源"
            placeholder="搜索学习资源" /></label
        ><select v-model="type" aria-label="资源格式">
          <option>全部格式</option>
          <option v-for="t in [...new Set(store.data.resources.map((r) => r.type))]" :key="t">
            {{ t }}
          </option></select
        ><select v-model="sort" aria-label="资源排序">
          <option>最新发布</option>
          <option>下载最多</option>
        </select>
      </div>
    </div>
    <div v-if="resources.length" class="resource-catalog">
      <ResourceCard v-for="resource in resources" :key="resource.id" :resource="resource" />
    </div>
    <section v-else class="panel">
      <p v-if="loading" class="small-empty">正在读取…</p>
      <p v-if="error" class="form-error">
        {{ error }} <button class="text-link" @click="load">重试</button>
      </p>
      <EmptyState
        title="还没有找到合适的资料"
        description="试试其他关键词，或分享你珍藏的学习资源。"
      />
    </section>
    <Pagination v-model="page" :total="total" />
    <div class="resource-sharing-note">
      <Icon name="ShieldCheck" :size="19" />
      <p>尊重知识，尊重原创。请分享有授权或自己整理的内容，上传资源将在审核通过后展示。</p>
    </div>
  </div>
</template>
