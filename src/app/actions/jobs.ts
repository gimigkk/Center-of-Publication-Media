'use server';

import {
  fetchGoogleDocTitleAction as _fetchGoogleDocTitleAction,
  getJobsAction as _getJobsAction,
} from './jobs/queries';

import {
  createJobAction as _createJobAction,
  moveJobAction as _moveJobAction,
  updateJobDeadlineAction as _updateJobDeadlineAction,
  deleteJobAction as _deleteJobAction,
} from './jobs/mutations';

import {
  assignDesignerAction as _assignDesignerAction,
  setJobDesignersAction as _setJobDesignersAction,
  getDesignerWorkloadsAction as _getDesignerWorkloadsAction,
  getDesignerSuggestionsAction as _getDesignerSuggestionsAction,
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

export async function updateJobDeadlineAction(
  jobId: string,
  deadline: string,
  _actor?: Profile
) {
  void _actor;
  return _updateJobDeadlineAction(jobId, deadline);
}

export async function assignDesignerAction(
  jobId: string,
  designerId: string,
  _actor?: Profile
) {
  void _actor;
  return _assignDesignerAction(jobId, designerId);
}

export async function setJobDesignersAction(
  jobId: string,
  designerIds: string[],
  _actor?: Profile
) {
  void _actor;
  return _setJobDesignersAction(jobId, designerIds);
}

export async function getDesignerWorkloadsAction() {
  return _getDesignerWorkloadsAction();
}

export async function getDesignerSuggestionsAction(pageId?: string) {
  return _getDesignerSuggestionsAction(pageId);
}

export async function archiveJobAction(jobId: string) {
  return _archiveJobAction(jobId);
}

export async function unarchiveJobAction(jobId: string) {
  return _unarchiveJobAction(jobId);
}

export async function deleteJobAction(
  jobId: string,
  actor: Profile
) {
  return _deleteJobAction(jobId, actor);
}

export async function archiveAllDoneJobsAction(pageId: string) {
  return _archiveAllDoneJobsAction(pageId);
}
