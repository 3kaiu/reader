/**
 * 问卷题库管理 API
 *
 * 接口来源：Apifox - 管理后台 - 问卷题库管理
 * 所需权限：product:survey:bank:update / product:survey:bank:get
 */

import type { ApiFetchOptions } from './http/types'
import { requestWithDirectFallback } from './http/transport'

// ==================== 请求 / 响应 DTO ====================

/** 答案 - 请求体 */
export interface SurveyAnswerReqVO {
  /** 答案ID（编辑时传） */
  id?: number
  /** 回答内容（必填） */
  answer: string
  /** 自定义前缀 */
  no?: string
  /** 排序 */
  sort?: number
}

/** 答案 - 响应体 */
export interface SurveyAnswerRespVO {
  /** 答案ID */
  id: number
  /** 问题ID */
  questionId: number
  /** 回答内容 */
  answer: string
  /** 自定义前缀 */
  no: string
  /** 排序 */
  sort: number
}

/** 新增/编辑题库问题 - 请求体 */
export interface SurveyQuestionBankSaveReqVO {
  /** 题库问题ID（编辑时传） */
  id?: number
  /** 问题类型 1文本 2电话 3选择题（必填） */
  type: number
  /** 问题题干（必填） */
  question: string
  /** 产线 */
  bizType?: number
  /** 答案列表 */
  answers?: SurveyAnswerReqVO[]
}

/** 题库问题 - 响应体 */
export interface SurveyQuestionBankRespVO {
  /** 题库问题ID */
  id: number
  /** 问题类型 1文本 2电话 3选择题 */
  type: number
  /** 问题类型描述 */
  typeDesc: string
  /** 问题题干 */
  question: string
  /** 产线 */
  bizType: number
  /** 产线描述 */
  bizTypeDesc: string
  /** 答案列表 */
  answers: SurveyAnswerRespVO[]
  /** 创建时间 */
  createTime: string
  /** 创建人 */
  createdBy: string
  /** 更新时间 */
  updateTime: string
  /** 更新人 */
  updatedBy: string
}

/** 题库问题分页查询 - 请求体 */
export interface SurveyQuestionBankPageReqVO {
  /** 页码，从 1 开始（必填） */
  pageNo: number
  /** 每页条数，最大值 100（必填） */
  pageSize: number
  /** 问题名称 */
  name?: string
  /** 问题类型 1文本 2电话 3选择题 */
  type?: number
  /** 产线 */
  bizType?: number
}

/** 分页结果 */
export interface PageResultSurveyQuestionBankRespVO {
  /** 数据列表 */
  list: SurveyQuestionBankRespVO[]
  /** 总量 */
  total: number
  /** 体验课数据截止时间 */
  experienceDataCutoffTime: string
}

/** 枚举项 */
export interface EnumRespVO {
  /** 枚举编码 */
  code: number
  /** 枚举描述 */
  desc: string
}

// ==================== 通用响应包装 ====================

/** 后端统一响应格式 */
export interface CommonResult<T> {
  /** 错误码，0 为成功 */
  code: number
  /** 返回数据 */
  data: T
  /** 错误提示 */
  msg: string
  /** 时间戳 */
  timestamp: number
}

/** 解包后的 API 返回 */
export interface SurveyApiResult<T> {
  isSuccess: boolean
  data: T
  errorMsg?: string
  code: number
}

/** 解包后端 CommonResult 响应 */
export function unwrapCommonResult<T>(raw: CommonResult<T>): SurveyApiResult<T> {
  const isSuccess = raw.code === 0
  return {
    isSuccess,
    data: raw.data,
    errorMsg: isSuccess ? undefined : raw.msg,
    code: raw.code,
  }
}

// ==================== 请求基础配置 ====================

/**
 * 问卷题库 API 基础路径。
 * 实际请求 URL = VITE_API_URL + SURVEY_BANK_BASE_PATH + 接口路径
 * 若 VITE_API_URL 设为 https://pro-admin-test.gracelore.cc/admin-api 则直接生效。
 */
const SURVEY_BANK_BASE_PATH = ''

/** 构建 Authorization 请求头 */
export function buildAuthHeaders(): Record<string, string> {
  const token = import.meta.env.VITE_SURVEY_API_TOKEN as string | undefined
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/** 发起请求并解包 CommonResult */
export async function surveyRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  body?: unknown,
  extraParams?: Record<string, unknown>
): Promise<SurveyApiResult<T>> {
  const headers = buildAuthHeaders()
  const options: ApiFetchOptions = {
    method,
    headers,
  }

  let fullUrl = `${SURVEY_BANK_BASE_PATH}${url}`

  // GET/DELETE: query 参数拼到 URL 上
  if (extraParams && (method === 'GET' || method === 'DELETE')) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(extraParams)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    }
    const qs = searchParams.toString()
    if (qs) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs
    }
  }

  if (body !== undefined) {
    options.body = body
  }

  const raw = await requestWithDirectFallback<CommonResult<T>>(fullUrl, options)
  return unwrapCommonResult(raw)
}

// ==================== API 方法 ====================

export const surveyBankApi = {
  /**
   * 新增/编辑题库问题
   * POST /ops/survey/bank/save
   * 所需权限：product:survey:bank:update
   */
  save: (params: SurveyQuestionBankSaveReqVO) =>
    surveyRequest<SurveyQuestionBankRespVO>(
      'POST',
      '/ops/survey/bank/save',
      params
    ),

  /**
   * 获取题库问题详情
   * GET /ops/survey/bank/get?id=xxx
   * 所需权限：product:survey:bank:get
   */
  getDetail: (id: number) =>
    surveyRequest<SurveyQuestionBankRespVO>(
      'GET',
      '/ops/survey/bank/get',
      undefined,
      { id }
    ),

  /**
   * 题库问题分页查询
   * POST /ops/survey/bank/page
   * 所需权限：product:survey:bank:get
   */
  getPage: (params: SurveyQuestionBankPageReqVO) =>
    surveyRequest<PageResultSurveyQuestionBankRespVO>(
      'POST',
      '/ops/survey/bank/page',
      params
    ),

  /**
   * 删除题库问题
   * DELETE /ops/survey/bank/delete?id=xxx
   * 所需权限：product:survey:bank:update
   */
  deleteQuestion: (id: number) =>
    surveyRequest<boolean>(
      'DELETE',
      '/ops/survey/bank/delete',
      undefined,
      { id }
    ),

  /**
   * 删除题库答案
   * DELETE /ops/survey/bank/answer/delete?answerId=xxx
   * 所需权限：product:survey:bank:update
   */
  deleteAnswer: (answerId: number) =>
    surveyRequest<boolean>(
      'DELETE',
      '/ops/survey/bank/answer/delete',
      undefined,
      { answerId }
    ),

  /**
   * 获取枚举信息
   * GET /ops/survey/bank/enum/get?enumName=xxx
   * 所需权限：product:survey:bank:get
   *
   * @param enumName 枚举名称，可选值：
   *   BizTypeEnum(学习类目), QuestionTypeEnum(题型),
   *   SurveyStatusEnum(问卷状态), SurveyTabEnum(指定弹窗内容)
   */
  getEnum: (enumName: string) =>
    surveyRequest<EnumRespVO[]>(
      'GET',
      '/ops/survey/bank/enum/get',
      undefined,
      { enumName }
    ),
}
