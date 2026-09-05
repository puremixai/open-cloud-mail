<template>
  <IconButton action="menu" :label="$t('ux.sidebar')" :aria-expanded="isActive" @click="$emit('toggleClick')" />
</template>
<script setup>
import IconButton from '@/components/icon-button/index.vue'
defineProps({ isActive: { type: Boolean, default: false } })
defineEmits(['toggleClick'])
</script>
