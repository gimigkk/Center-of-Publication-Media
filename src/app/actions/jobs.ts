'use server';

import {
  fetchGoogleDocTitleAction as _fetchGoogleDocTitleAction,
  getJobsAction as _getJobsAction,
} from './jobs/queries';

import {
  createJobAction as _createJobAction,
  moveJobAction as _moveJobAction,
} from './jobs/mutations';

import {
  assignDesignerAction as _assignDesignerAction,
  setJobDesignersAction as _setJobDesignersAction,
  getDesignerWorkloadsAction as _getDesignerWorkloadsAction,
} from './jobs/designers';

import {
  archiveJobAction as _archiveJobAction,
  unarchiveJobAction as _unarchiveJobAction,
  archiveAllDoneJobsAction as _archiveAllDoneJobsAction,
} from './jobs/archive';
import { JobStatus, Profile } from '@/types';

export async function fetchGoogleDocTitleAction(url: string) {
  return _fetchGoogleDocTitleAction(url);
}

export async function getJobsAction(pageId: string) {
  return _getJobsAction(pageId);
}

export async function createJobAction(formData: Parameters<typeof _createJobAction>[0]) {
  return _createJobAction(formData);
}

export async function moveJobAction(
  jobId: string,
  toStatus: JobStatus,
  actor: Profile,
  note?: string
) {
  return _moveJobAction(jobId, toStatus, actor, note);
}

export async function assignDesignerAction(
  jobId: string,
  designerId: string,
  actor: Profile
) {
  return _assignDesignerAction(jobId, designerId, actor);
}

export async function setJobDesignersAction(
  jobId: string,
  designerIds: string[],
  actor: Profile
) {
  return _setJobDesignersAction(jobId, designerIds, actor);
}

export async function getDesignerWorkloadsAction() {
  return _getDesignerWorkloadsAction();
}

export async function getDesignerSuggestionsAction() {
  return _getDesignerWorkloadsAction();
}

export async function archiveJobAction(
  jobId: string,
  actor: Profile
) {
  return _archiveJobAction(jobId, actor);
}

export async function unarchiveJobAction(
  jobId: string,
  actor: Profile
) {
  return _unarchiveJobAction(jobId, actor);
}

export async function archiveAllDoneJobsAction(
  pageId: string,
  actor: Profile
) {
  return _archiveAllDoneJobsAction(pageId, actor);
}
