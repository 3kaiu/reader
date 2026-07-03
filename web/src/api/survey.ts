/**
 * 问卷管理 API
 *
 * 接口来源：Apifox - 管理后台 - 问卷管理
 * 所需权限：product:survey:update / product:survey:get
 */

import type { ApiFetchOptions } from './http/types'
import type { SurveyQuestionBankRespVO, SurveyApiResult, CommonResult } from './surveyBank'
import { buildAuthHeaders, surveyRequest, unwrapCommonResult } from './surveyBank'
import { requestWithDirectFallback } from './http/transport'

// ==================== 逻辑配置 ====================

/** 逻辑条件 */
export interface SurveyAnswerLogicConditionVO {
  /** 关系 AND/OR */
  relation: string
  /** 表达式 eq */
  expression: string
  /** 问卷问题ID */
  surveyQuestionId: string
  /** 问卷答案ID */
  surveyAnswerId: number
  /** 题库问题ID */
  bankQuestionId: string
  /** 题库答案ID */
  bankAnswerId: number
}

/** 逻辑触发条件 */
export interface SurveyAnswerLogicTriggerVO {
  /** 类型 show */
  type: string
  /** 问卷问题ID列表 */
  surveyQuestionIdList: string[]
  /** 题库问题ID列表 */
  bankQuestionIdList: string[]
}

/** 逻辑方案 */
export interface SurveyAnswerLogicSchemeVO {
  /** 触发条件 */
  trigger: SurveyAnswerLogicTriggerVO
  /** 条件列表 */
  conditionList: SurveyAnswerLogicConditionVO[]
}

/** 答案逻辑配置 */
export interface SurveyAnswerLogicVO {
  /** 问卷问题ID */
  surveyQuestionId: string
  /** 方案列表 */
  scheme: SurveyAnswerLogicSchemeVO[]
}

// ==================== 问卷答案 ====================

/** 问卷答案 - 请求体 */
export interface SurveyAnswerReqVO {
  /** 答案ID（编辑时传） */
  id?: number
  /** 回答内容 */
  answer: string
  /** 自定义前缀 */
  no?: string
  /** 排序 */
  sort?: number
}

/** 问卷答案 - 响应体 */
export interface SurveyAnswerRespVO {
  /** 答案ID */
  id: number
  /** 问卷问题ID */
  surveyQuestionId: number
  /** 回答内容 */
  answer: string
  /** 自定义前缀 */
  no: string
  /** 排序 */
  sort: number
}

// ==================== 问卷问题 ====================

/** 问卷问题 - 请求体 */
export interface SurveyQuestionReqVO {
  /** 问卷问题ID（编辑时传） */
  id?: number
  /** 问题类型 1文本 2电话 3选择题 */
  type: number
  /** 选择题类型 1单选 2多选 */
  selectType?: number
  /** 特殊类型 1分流 */
  specialType?: number
  /** 层级 主1 次2 */
  level?: number
  /** 父级问题ID */
  parentSurveyQuestionId?: number
  /** 题库问题ID */
  bankQuestionId?: number
  /** 排序 */
  sort?: number
  /** 答案列表 */
  answers?: SurveyAnswerReqVO[]
  /** 逻辑配置 */
  logic?: SurveyAnswerLogicVO
}

/** 问卷问题 - 响应体 */
export interface SurveyQuestionRespVO {
  /** 问卷问题ID */
  id: number
  /** 问题类型 1文本 2电话 3选择题 */
  type: number
  /** 问题类型描述 */
  typeDesc: string
  /** 选择题类型 1单选 2多选 */
  selectType: number
  /** 选择题类型描述 */
  selectTypeDesc: string
  /** 特殊类型 1分流 */
  specialType: number
  /** 特殊类型描述 */
  specialTypeDesc: string
  /** 层级 主1 次2 */
  level: number
  /** 父级问题ID */
  parentSurveyQuestionId: number
  /** 题库问题ID */
  bankQuestionId: number
  /** 问题题干 */
  question: string
  /** 排序 */
  sort: number
  /** 答案列表 */
  answers: SurveyAnswerRespVO[]
  /** 逻辑配置 */
  logic: SurveyAnswerLogicVO
}

// ==================== 问卷 ====================

/** 新增/编辑问卷 - 请求体 */
export interface SurveyReqVO {
  /** 问卷ID（编辑时传） */
  id?: number
  /** 问卷名称（必填） */
  name: string
  /** 课程ID/弹窗码 */
  businessId?: string
  /** 问卷弹窗类型 1课程 2指定弹窗 */
  businessType?: number
  /** 产线（必填） */
  bizType: number
  /** 问卷问题列表 */
  questions?: SurveyQuestionReqVO[]
}

/** 问卷 - 响应体 */
export interface SurveyRespVO {
  /** 问卷ID */
  id: number
  /** 问卷名称 */
  name: string
  /** 课程ID/弹窗码 */
  businessId: string
  /** 问卷弹窗类型 1课程 2指定弹窗 */
  businessType: number
  /** 问卷弹窗类型描述 */
  businessTypeDesc: string
  /** 产线 */
  bizType: number
  /** 产线描述 */
  bizTypeDesc: string
  /** 状态 0已保存待发布 1已发布 */
  status: number
  /** 状态描述 */
  statusDesc: string
  /** 问卷问题列表 */
  questions: SurveyQuestionRespVO[]
  /** 创建时间 */
  createTime: string
  /** 创建人 */
  createdBy: string
  /** 更新时间 */
  updateTime: string
  /** 更新人 */
  updatedBy: string
}

/** 问卷分页查询 - 请求体 */
export interface SurveyPageReqVO {
  /** 页码，从 1 开始（必填） */
  pageNo: number
  /** 每页条数，最大值 100（必填） */
  pageSize: number
  /** 问卷名称 */
  name?: string
  /** 问卷弹窗类型 1课程 2指定弹窗 */
  businessType?: number
  /** 状态 0已保存待发布 1已发布 */
  status?: number
  /** 产线 */
  bizType?: number
}

/** 问卷分页结果 */
export interface PageResultSurveyRespVO {
  /** 数据列表 */
  list: SurveyRespVO[]
  /** 总量 */
  total: number
  /** 体验课数据截止时间 */
  experienceDataCutoffTime: string
}

// ==================== 题库问题选择 / 答案关联问题 ====================

/** 题库问题选择 / 答案关联问题 - 请求体 */
export interface SurveyQuestionBankChoicePageReqVO {
  /** 问卷ID */
  surveyId?: number
  /** 问卷问题ID */
  surveyQuestionId?: number
  /** 问卷答案ID集合 */
  surveyAnswerIds?: number[]
}

/** 问卷问题分页结果（答案关联问题接口返回） */
export interface PageResultSurveyQuestionRespVO {
  /** 数据列表 */
  list: SurveyQuestionRespVO[]
  /** 总量 */
  total: number
  /** 体验课数据截止时间 */
  experienceDataCutoffTime: string
}

// ==================== 弹窗页保存 ====================

/** 弹窗页保存 - 请求体 */
export interface SurveyTabQuestionSaveReqVO {
  /** 当前问题ID */
  surveyQuestionId?: number
  /** 选中的答案ID列表 */
  surveyAnswerIdList?: number[]
  /** 逻辑配置 */
  logic?: SurveyAnswerLogicVO
  /** 答案关联的子问题列表 */
  bankQuestionList?: SurveyQuestionReqVO[]
}

// ==================== API 方法 ====================

export const surveyApi = {
  /**
   * 新增/编辑问卷
   * POST /ops/survey/save
   * 所需权限：product:survey:update
   */
  save: (params: SurveyReqVO) =>
    surveyRequest<SurveyRespVO>('POST', '/ops/survey/save', params),

  /**
   * 获取问卷详情
   * GET /ops/survey/get?id=xxx
   * 所需权限：product:survey:get
   */
  getDetail: (id: number) =>
    surveyRequest<SurveyRespVO>('GET', '/ops/survey/get', undefined, { id }),

  /**
   * 问卷分页查询
   * POST /ops/survey/page
   * 所需权限：product:survey:get
   */
  getPage: (params: SurveyPageReqVO) =>
    surveyRequest<PageResultSurveyRespVO>('POST', '/ops/survey/page', params),

  /**
   * 删除问卷
   * DELETE /ops/survey/delete?id=xxx
   * 所需权限：product:survey:update
   */
  delete: (id: number) =>
    surveyRequest<boolean>('DELETE', '/ops/survey/delete', undefined, { id }),

  /**
   * 发布问卷
   * POST /ops/survey/publish?id=xxx（id 为 query 参数）
   * 所需权限：product:survey:update
   */
  publish: async (id: number): Promise<SurveyApiResult<boolean>> => {
    const headers = buildAuthHeaders()
    const options: ApiFetchOptions = {
      method: 'POST',
      headers,
    }
    const url = `/ops/survey/publish?id=${id}`
    const raw = await requestWithDirectFallback<CommonResult<boolean>>(url, options)
    return unwrapCommonResult(raw)
  },

  /**
   * 题库问题选择
   * POST /ops/survey/question/bank
   * 所需权限：product:survey:get
   */
  questionBank: (params: SurveyQuestionBankChoicePageReqVO) =>
    surveyRequest<{ list: SurveyQuestionBankRespVO[]; total: number; experienceDataCutoffTime: string }>(
      'POST',
      '/ops/survey/question/bank',
      params
    ),

  /**
   * 弹窗页保存
   * POST /ops/survey/tab/save
   * 所需权限：product:survey:update
   */
  tabSave: (params: SurveyTabQuestionSaveReqVO) =>
    surveyRequest<boolean>('POST', '/ops/survey/tab/save', params),

  /**
   * 答案关联问题分页查询
   * POST /ops/survey/answer/questions
   * 所需权限：product:survey:get
   */
  answerQuestions: (params: SurveyQuestionBankChoicePageReqVO) =>
    surveyRequest<PageResultSurveyQuestionRespVO>(
      'POST',
      '/ops/survey/answer/questions',
      params
    ),
}
