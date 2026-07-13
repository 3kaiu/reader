import type { Component, VNode } from 'vue'

export type StringOrVNode = string | VNode | (() => VNode)

export type ToasterToast = {
  id: string
  title?: string
  description?: StringOrVNode
  action?: Component
  variant?: 'default' | 'destructive'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const toastActionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const

type ToastActionType = typeof toastActionTypes

export type ToastAction =
  | {
      type: ToastActionType['ADD_TOAST']
      toast: ToasterToast
    }
  | {
      type: ToastActionType['UPDATE_TOAST']
      toast: Partial<ToasterToast>
    }
  | {
      type: ToastActionType['DISMISS_TOAST']
      toastId?: ToasterToast['id']
    }
  | {
      type: ToastActionType['REMOVE_TOAST']
      toastId?: ToasterToast['id']
    }

export interface ToastState {
  toasts: ToasterToast[]
}
