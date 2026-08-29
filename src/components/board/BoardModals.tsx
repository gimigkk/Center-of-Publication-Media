import React from 'react';
import { Job, JobStatus, Page, Profile, Division, UserRole } from '@/types';
import { JobFormModal } from '@/components/forms/JobFormModal';
import { JobDetailModal } from '@/components/forms/JobDetailModal';
import { CreatePageModal } from '@/components/forms/CreatePageModal';
import { DivisionManagerModal } from '@/components/admin/DivisionManagerModal';
import { ApprovalPanelModal } from '@/components/admin/ApprovalPanelModal';
import { EditProfileModal } from '@/components/forms/EditProfileModal';

interface BoardModalsProps {
  currentUser: Profile;
  currentPage: Page;
  divisions: Division[];
  pendingUsers: Profile[];
  designerSuggestions: { designer: Profile; activeWipCount: number }[];
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
  isApprovalsOpen: boolean;
  onCloseApprovals: () => void;
  isEditProfileOpen: boolean;
  onCloseEditProfile: () => void;
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
  onArchiveJob: (jobId: string) => Promise<void>;
  onUnarchiveJob: (jobId: string) => Promise<void>;
  onMoveJobStatus: (jobId: string, toStatus: JobStatus, note?: string) => Promise<{ success: boolean; error?: string }>;
  onCreatePage: (name: string, description?: string) => Promise<{ success: boolean; page?: Page; error?: string }>;
  onCreateDivision: (name: string) => Promise<{ success: boolean; division?: Division; error?: string }>;
  onUpdateDivision: (id: string, name: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteDivision: (id: string) => Promise<{ success: boolean; error?: string }>;
  onApproveUser: (userId: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  onRejectUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateProfile: (data: {
    fullName: string;
    avatarUrl: string;
    phoneNumber?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
}

export function BoardModals({
  currentUser,
  currentPage,
  divisions,
  pendingUsers,
  designerSuggestions,
  isJobFormOpen,
  onCloseJobForm,
  isDetailOpen,
  onCloseDetail,
  selectedJobForDetail,
  isCreatePageOpen,
  onCloseCreatePage,
  isDivisionsOpen,
  onCloseDivisions,
  isApprovalsOpen,
  onCloseApprovals,
  isEditProfileOpen,
  onCloseEditProfile,
  onDetailDropdownChange,
  onSubmitJob,
  onAssignDesigner,
  onArchiveJob,
  onUnarchiveJob,
  onMoveJobStatus,
  onCreatePage,
  onCreateDivision,
  onUpdateDivision,
  onDeleteDivision,
  onApproveUser,
  onRejectUser,
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
        divisions={divisions}
        onCreateDivision={onCreateDivision}
        onUpdateDivision={onUpdateDivision}
        onDeleteDivision={onDeleteDivision}
      />

      <ApprovalPanelModal
        isOpen={isApprovalsOpen}
        onClose={onCloseApprovals}
        pendingUsers={pendingUsers}
        onApprove={onApproveUser}
        onReject={onRejectUser}
      />

      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={onCloseEditProfile}
        currentUser={currentUser}
        onUpdateProfile={onUpdateProfile}
      />
    </>
  );
}
