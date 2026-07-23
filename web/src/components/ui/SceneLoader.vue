<script setup lang="ts">
/**
 * SceneLoader — 按场景自动选择数学曲线的加载动效便捷组件
 */
import { computed } from 'vue'
import CurveLoader from './CurveLoader.vue'
import { getCurve, SCENE_CURVES, type SceneName } from './curve-configs'

interface Props {
  scene: SceneName
  size?: number
  label?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 120,
  label: 'Loading',
  class: '',
})

const config = computed(() => getCurve(SCENE_CURVES[props.scene]))
</script>

<template>
  <CurveLoader :config="config" :size="size" :label="label" :class="props.class" />
</template>
