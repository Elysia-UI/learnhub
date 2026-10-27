import { computed, ref, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useCommunity } from '../stores/community';
import { uid } from '../services/storage';
import { readUpload } from '../services/files';
export function useModalController() {
  const store = useCommunity(),
    router = useRouter();
  const fresh = () => ({
    title: '',
    content: '',
    category: 'tech',
    tags: '',
    name: store.currentUser?.name || '',
    bio: store.currentUser?.bio || '',
    subtitle: '',
    hours: 12,
    level: '入门',
    email: '',
    password: '',
  });
  const form = ref(fresh()),
    register = ref(false),
    busy = ref(false),
    error = ref(''),
    file = ref<File>(),
    fileData = ref(''),
    chapters = ref([{ id: uid('chapter'), title: '', content: '' }]);
  const modalTitle = computed(
    () =>
      ({
        login: register.value ? '加入知学社区' : '欢迎回到知学社区',
        notice: store.modal?.payload?.title,
        about: '关于 LearnHub',
        question: store.modal?.payload ? '编辑问题' : '提出一个好问题',
        upload: '分享学习资源',
        profile: '编辑个人资料',
        course: store.modal?.payload ? '编辑课程' : '创建新课程',
        confirm: store.modal?.payload?.title || '确认操作',
      })[store.modal?.type || ''] || '知学社区',
  );
  watch(
    () => store.modal,
    (value) => {
      if (!value) {
        document.body.style.overflow = '';
        return;
      }
      document.body.style.overflow = 'hidden';
      error.value = '';
      busy.value = false;
      register.value = false;
      file.value = undefined;
      fileData.value = '';
      form.value = fresh();
      if (value.type === 'question' && value.payload)
        Object.assign(form.value, value.payload, { tags: value.payload.tags.join('，') });
      if (value.type === 'course' && value.payload) {
        Object.assign(form.value, value.payload, { content: value.payload.description });
        chapters.value = value.payload.chapters.map((c: any) => ({
          id: c.id,
          title: c.title,
          content: c.content,
        }));
      } else chapters.value = [{ id: uid('chapter'), title: '', content: '' }];
    },
    { immediate: true },
  );
  onUnmounted(() => (document.body.style.overflow = ''));
  const close = () => {
    if (!busy.value) store.modal = null;
  };
  async function chooseFile(event: Event) {
    const chosen = (event.target as HTMLInputElement).files?.[0];
    if (!chosen) return;
    error.value = '';
    if (chosen.size > 10 * 1024 * 1024) {
      error.value = '附件不能超过 10 MB';
      return;
    }
    file.value = chosen;
    if (store.modal?.type === 'profile') {
      if (chosen.size > 2 * 1024 * 1024) {
        error.value = '头像不能超过 2 MB';
        file.value = undefined;
        return;
      }
      try {
        fileData.value = await readUpload(chosen);
      } catch (e) {
        error.value = (e as Error).message;
        file.value = undefined;
      }
    }
    if (!form.value.title) form.value.title = chosen.name.replace(/\.[^.]+$/, '');
  }
  async function submit() {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      const type = store.modal?.type,
        payload = store.modal?.payload;
      if (type === 'login') {
        await store.login(
          form.value.email.trim(),
          form.value.password,
          register.value ? form.value.name.trim() : undefined,
        );
        form.value.password = '';
        return;
      }
      if (type === 'profile') {
        if (form.value.name.trim().length < 2) throw new Error('昵称至少需要 2 个字');
        const avatar = file.value ? (await store.uploadAvatar(file.value)).url : undefined;
        await store.saveProfile({
          name: form.value.name.trim(),
          bio: form.value.bio.trim(),
          avatar,
        });
      }
      if (type === 'question') {
        const id = await store.saveQuestion(
          {
            title: form.value.title.trim(),
            content: form.value.content.trim(),
            category: form.value.category,
            tags: form.value.tags
              .split(/[,，]/)
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 5),
          },
          payload?.id,
        );
        if (id) await router.push(`/questions/${id}`);
      }
      if (type === 'upload') {
        if (!file.value) throw new Error('请选择资源文件');
        const body = new FormData();
        body.append('file', file.value);
        body.append('title', form.value.title.trim());
        body.append('description', form.value.content.trim());
        body.append('category', form.value.category);
        body.append(
          'tags',
          JSON.stringify(
            form.value.tags
              .split(/[,，]/)
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 5),
          ),
        );
        await store.addResource(body);
      }
      if (type === 'course') {
        await store.saveCourse(
          {
            title: form.value.title.trim(),
            subtitle: form.value.subtitle.trim(),
            description: form.value.content.trim(),
            category: form.value.category,
            hours: Number(form.value.hours),
            level: form.value.level,
            chapters: chapters.value.map((c) => ({
              id: c.id,
              title: c.title.trim(),
              content: c.content.trim(),
              duration: '图文课程',
            })),
          },
          payload?.id,
        );
      }
      if (type === 'confirm') await payload?.onConfirm?.();
      store.modal = null;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      busy.value = false;
    }
  }
  return {
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
  };
}
