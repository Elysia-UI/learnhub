<script setup lang="ts">
import type { Resource } from '../data/types';
import Icon from './Icon.vue';
import { count } from '../services/format';
defineProps<{ resource: Resource }>();
</script>
<template>
  <RouterLink :to="`/resources/${resource.id}`" class="resource-card"
    ><span class="file-tile" :class="`file-${resource.type.toLowerCase()}`"
      ><Icon
        :name="
          ['ZIP'].includes(resource.type)
            ? 'FileArchive'
            : ['CSV', 'XLSX', 'XLS'].includes(resource.type)
              ? 'FileSpreadsheet'
              : resource.type === 'MD'
                ? 'FileCode'
                : 'FileText'
        "
        :size="26"
    /></span>
    <div class="resource-copy">
      <h3>{{ resource.title }}</h3>
      <p>{{ resource.description }}</p>
      <div class="resource-meta">
        <span class="file-type" :class="`file-${resource.type.toLowerCase()}`">{{
          resource.type
        }}</span
        ><span>{{ resource.size }}</span
        ><span><Icon name="Download" :size="12" />{{ count(resource.downloads) }}</span>
      </div>
    </div></RouterLink
  >
</template>
