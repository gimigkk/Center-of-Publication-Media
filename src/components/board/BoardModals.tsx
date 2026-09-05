import React from 'react';
import { Job, JobStatus, Page, Profile, Division } from '@/types';
import { JobFormModal } from '@/components/forms/JobFormModal';
import { JobDetailModal } from '@/components/forms/JobDetailModal';
import { CreatePageModal } from '@/components/forms/CreatePageModal';
import { DivisionManagerModal } from '@/components/admin/DivisionManagerModal';
import { EditProfileModal } from '@/components/forms/EditProfileModal';
import { JobStatsModal } from '@/components/analytics/JobStatsModal';

interface BoardModalsProps {
  currentUser: Profile;
  currentPage: Page;
  divisions: Division[];
  designerSuggestions: { designer: Profile; activeWipCount: number }[];
  jobs: Job[];
  allUsers: Profile[];
  pages?: Page[];
  // Modal visibility states
  isJobFormOpen: boolean;
  onCloseJobForm: () => void;
  isDetailOpen: boolean;
  onCloseDetail: () => void;
  selectedJobForDetail: Job | null;
  isCreatePageOpen: boolean;
  onCloseCreatePage: () => void;
  isDivisionsOpen: boolean;
  onCloseDivisions: () => void;
  isEditProfileOpen: boolean;
  onCloseEditProfile: () => void;
  isGraphOpen: boolean;
  onCloseGraph: () => void;
  onDetailDropdownChange: (state: string | null) => void;
  // Handlers
  onSubmitJob: (formData: {
    pageId: string;
    title: string;
    description?: string;
    briefLink: string;
    divisionId: string;
    publicationMedia: string;
    deadline: string;
    requestorId: string;
  }) => Promise<{ success: boolean; job?: Job; error?: string }>;
  onAssignDesigner: (jobId: string, designerId: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateDeadline?: (jobId: string, deadline: string) => Promise<{ success: boolean; error?: string }>;
  onArchiveJob: (jobId: string) => Promise<void>;
  onUnarchiveJob: (jobId: string) => Promise<void>;
  onMoveJobStatus: (jobId: string, toStatus: JobStatus, note?: string) => Promise<{ success: boolean; error?: string }>;
  onCreatePage: (name: string, description?: string) => Promise<{ success: boolean; page?: Page; error?: string }>;
  onCreateDivision: (name: string) => Promise<{ success: boolean; division?: Division; error?: string }>;
  onUpdateDivision: (id: string, name: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteDivision: (id: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateProfile: (data: {
    fullName: string;
    avatarUrl?: string | null;
    phoneNumber?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
}

export function BoardModals({
  currentUser,
  currentPage,
  divisions,
  designerSuggestions,
  jobs,
  allUsers,
  pages,
  isJobFormOpen,
  onCloseJobForm,
  isDetailOpen,
  onCloseDetail,
  selectedJobForDetail,
  isCreatePageOpen,
  onCloseCreatePage,
  isDivisionsOpen,
  onCloseDivisions,
  isEditProfileOpen,
  onCloseEditProfile,
  isGraphOpen,
  onCloseGraph,
  onDetailDropdownChange,
  onSubmitJob,
  onAssignDesigner,
  onUpdateDeadline,
  onArchiveJob,
  onUnarchiveJob,
  onMoveJobStatus,
  onCreatePage,
  onCreateDivision,
  onUpdateDivision,
  onDeleteDivision,
  onUpdateProfile,
}: BoardModalsProps) {
  return (
    <>
      <JobFormModal
        isOpen={isJobFormOpen}
        onClose={onCloseJobForm}
        currentPage={currentPage}
        divisions={divisions}
        currentUser={currentUser}
        onSubmitJob={onSubmitJob}
      />

      <JobDetailModal
        isOpen={isDetailOpen}
        onClose={onCloseDetail}
        job={selectedJobForDetail}
        currentUser={currentUser}
        designersWithWorkload={designerSuggestions}
        onAssign={onAssignDesigner}
        onUpdateDeadline={onUpdateDeadline}
        onArchive={onArchiveJob}
        onUnarchive={onUnarchiveJob}
        onMoveStatus={onMoveJobStatus}
        onDropdownChange={onDetailDropdownChange}
      />

      <CreatePageModal
        isOpen={isCreatePageOpen}
        onClose={onCloseCreatePage}
        currentUser={currentUser}
        onCreatePage={onCreatePage}
      />

      <DivisionManagerModal
        isOpen={isDivisionsOpen}
        onClose={onCloseDivisions}
        currentPage={currentPage}
        divisions={divisions}
        onCreateDivision={onCreateDivision}
        onUpdateDivision={onUpdateDivision}
        onDeleteDivision={onDeleteDivision}
      />

      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={onCloseEditProfile}
        currentUser={currentUser}
        onUpdateProfile={onUpdateProfile}
      />

      <JobStatsModal
        isOpen={isGraphOpen}
        onClose={onCloseGraph}
        currentPage={currentPage}
        jobs={jobs}
        allUsers={allUsers}
        currentUser={currentUser}
        pages={pages}
      />
    </>
  );
}
