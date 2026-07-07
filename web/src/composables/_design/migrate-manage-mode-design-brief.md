# Design Brief: 管理模式逻辑抽象

## 目标

将 sources 和 replace-rule 页面中重复的「管理模式」逻辑（删除、批量删除、对话框控制、页面导航）抽象为通用 composable，消除 95% 的样板代码重复。

## 现状

三个页面都用了 `useManageSelection`（共享的核心），但各自有独立的：

| 模块 | sources | replace-rule | bookshelf |
|---|---|---|---|
| `state.ts` | showImport, showEdit, currentEditSource | showImport, showEdit, currentEditRule | 结构不同 |
| `dialogs.ts` | openImport(source), openEdit(source?) | openImport(), openEdit(rule?) | 无 |
| `management.ts` | delete, batchDelete, export | delete, batchDelete, export | 结构不同 |
| `navigation.ts` | goBack | goBack | 不同 |
| `loading.ts` | load + toggle + snapshot | load + toggle | 无 |

其中 `state.ts`、`dialogs.ts`（openImport/Edit）、`management.ts`（delete/batchDelete）和 `navigation.ts`（goBack）的 **逻辑完全相同**，只有类型参数不同。

## 抽象策略

**不创建巨型通用 composable**。改为按职责逐个提取通用工厂函数。

### Step 1: 通用管理状态

```ts
// composables/manage-mode/useManageState.ts
export function createManageState<T>() {
  const showImport = ref(false)
  const showEdit = ref(false)
  const currentEditItem = ref<T | null>(null)
  return { showImport, showEdit, currentEditItem }
}
```

取代：`source-management/state.ts` + `replace-rule-management/state.ts`

### Step 2: 通用对话框操作

```ts
// composables/manage-mode/dialogs.ts
export function createManageDialogActions<T>(state: { showImport: Ref<boolean>; showEdit: Ref<boolean>; currentEditItem: Ref<T | null> }) {
  function openImport() { state.showImport.value = true }
  function openEdit(item?: T) { ... }
  return { openImport, openEdit }
}
```

取代：`source-management/dialogs.ts` + `replace-rule-management/dialogs.ts`

### Step 3: 通用删除操作

```ts
// composables/manage-mode/management.ts
export function createManageDeleteActions<T, K extends string>(options: {
  name: (item: T) => string
  getKey: (item: T) => K
  selectedKeys: Ref<Set<K>>
  confirm: ConfirmFn
  success: (msg: string) => void
  error: (msg: string) => void
  warning: (msg: string) => void
  handlePromiseError: (cause: unknown, fallback?: string) => void
  deleteByIds: (ids: K[]) => Promise<{ status: string; deletedCount?: number; failedCount?: number; remainingIds?: K[]; errorMsg?: string }>
}) {
  async function deleteItem(item: T) { ... }
  async function batchDelete() { ... }
  return { deleteItem, batchDelete }
}
```

### Step 4: 通用导航

```ts
// composables/manage-mode/navigation.ts
export function createManageNavigationActions(router: Router, fallback?: string) {
  function goBack() { void router.push(fallback || '/') }
  return { goBack }
}
```

## 实施顺序

1. 创建 `composables/manage-mode/` 目录
2. 提取 `state.ts` + `dialogs.ts`（最独立，无副作用）
3. 提取 `navigation.ts`
4. 提取 `management.ts`（删除操作）
5. 重构 `source-management/` 各文件为薄代理层
6. 重构 `replace-rule-management/` 各文件为薄代理层
7. 删除 `source-management/state.ts`、`dialogs.ts`、`navigation.ts`
8. 删除 `replace-rule-management/state.ts`、`dialogs.ts`、`navigation.ts`

## 验证

- `bun run type-check` 通过
- 两个页面 `sources.vue` 和 `replace-rule.vue` 功能一致（手动打开页面测试）