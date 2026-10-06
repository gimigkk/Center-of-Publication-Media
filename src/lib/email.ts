import nodemailer from 'nodemailer';
import { JobStatus } from '@/types';

interface SendNotificationParams {
  jobTitle: string;
  briefLink: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  actorName: string;
  actorEmail: string;
  recipients: string[];
  note?: string;
  deadline?: string;
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || user === 'notifications@example.com') {
    return null; // SMTP not configured yet
  }


  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

const STATUS_LABELS: Record<JobStatus, string> = {
  in_queue: 'Antrian',
  wip: 'Sedang Dikerjakan',
  revisions: 'Revisi',
  done: 'Selesai',
};

export async function sendJobStatusEmail({
  jobTitle,
  briefLink,
  fromStatus,
  toStatus,
  actorName,
  actorEmail,
  recipients,
  note,
  deadline,
}: SendNotificationParams): Promise<{ success: boolean; error?: string }> {
  // Exclude the actor from receiving their own notification
  const filteredRecipients = recipients.filter(
    (email) => email.toLowerCase() !== actorEmail.toLowerCase()
  );

  if (filteredRecipients.length === 0) {
    return { success: true };
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.log(
      `[COPM SMTP Mock] Perubahan status untuk "${jobTitle}": ${fromStatus ? STATUS_LABELS[fromStatus] : 'Baru'
      } → ${STATUS_LABELS[toStatus]} oleh ${actorName}. Penerima:`,
      filteredRecipients
    );
    return { success: true };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const fromLabel = fromStatus ? STATUS_LABELS[fromStatus] : 'Pengajuan';
  const toLabel = STATUS_LABELS[toStatus];

  const textContent = [
    `COPM — Notifikasi Operasional Kreatif`,
    `Pembaruan Kartu Job: ${jobTitle}`,
    ``,
    `${actorName} memindahkan status job ini dari "${fromLabel}" ke "${toLabel}".`,
    note ? `Catatan: ${note}` : '',
    ``,
    `Tautan Brief: ${briefLink}`,
    deadline ? `Deadline: ${deadline}` : '',
    ``,
    `Buka di board COPM: ${appUrl}`,
    ``,
    `Notifikasi otomatis dikirim oleh Papan Operasional Kreatif COPM.`,
  ]
    .filter(Boolean)
    .join('\n');

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fdfdfd; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 12px;">
        <span style="font-size: 18px; font-weight: 700; color: #1e1e1e; letter-spacing: -0.5px;">COPM</span>
        <span style="font-size: 13px; color: #6e6e6e; margin-left: 8px;">Notifikasi Operasional Kreatif</span>
      </div>

      <h2 style="font-size: 16px; font-weight: 600; color: #1e1e1e; margin-top: 0;">
        Pembaruan Kartu Job: <span style="color: #0d99ff;">${jobTitle}</span>
      </h2>

      <p style="font-size: 14px; color: #444; line-height: 1.5;">
        <strong>${actorName}</strong> memindahkan status job ini dari <strong>${fromLabel}</strong> ke <strong style="color: #0d99ff;">${toLabel}</strong>.
      </p>

      ${note
      ? `<div style="background: #f5f5f5; padding: 12px; border-left: 3px solid #0d99ff; border-radius: 4px; font-size: 13px; color: #333; margin: 16px 0;">
              <strong>Catatan:</strong> ${note}
            </div>`
      : ''
    }

      <div style="margin: 20px 0; padding: 16px; background: #fafafa; border-radius: 6px; border: 1px solid #eaeaea;">
        <div style="font-size: 13px; margin-bottom: 6px;"><strong>Tautan Brief:</strong> <a href="${briefLink}" target="_blank" style="color: #0d99ff; text-decoration: none;">Buka Google Doc</a></div>
        ${deadline ? `<div style="font-size: 13px; color: #666;"><strong>Deadline Waktu:</strong> ${deadline}</div>` : ''}
      </div>

      <div style="margin-top: 24px;">
        <a href="${appUrl}" style="display: inline-block; background: #0d99ff; color: #ffffff; padding: 10px 18px; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px;">Lihat di Board COPM</a>
      </div>

      <div style="margin-top: 32px; font-size: 11px; color: #999; border-top: 1px solid #f0f0f0; padding-top: 12px;">
        Notifikasi otomatis ini dikirim oleh aktivitas di Papan Operasional Kreatif COPM.
      </div>
    </div>
  `;

  try {
    const fromAddress = process.env.SMTP_FROM || 'COPM <notifications@example.com>';
    // Send individually to each recipient to avoid spam triggers from multiple 'to' addresses
    await Promise.all(
      filteredRecipients.map((recipient) =>
        transporter.sendMail({
          from: fromAddress,
          to: recipient,
          replyTo: actorEmail,
          subject: `[COPM] ${jobTitle} → ${toLabel}`,
          text: textContent,
          html: htmlContent,
          headers: {
            'X-Entity-Ref-ID': `copm-job-${Date.now()}`,
          },
        })
      )
    );
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send email';
    console.error('Error sending SMTP notification:', message);
    return { success: false, error: message };
  }
}

export async function sendUserSignupEmail({
  newUserFullName,
  newUserEmail,
  newUserRole,
  adminEmails,
}: {
  newUserFullName: string;
  newUserEmail: string;
  newUserRole: string;
  adminEmails: string[];
}): Promise<{ success: boolean; error?: string }> {
  if (adminEmails.length === 0) return { success: true };

  const transporter = createTransporter();
  if (!transporter) {
    console.log(
      `[COPM SMTP Mock] Pendaftaran User Baru: ${newUserFullName} (${newUserEmail}) sebagai ${newUserRole}. Penerima Admin:`,
      adminEmails
    );
    return { success: true };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const textContent = [
    `COPM — Pendaftaran Anggota Baru`,
    `Pendaftaran Memerlukan Persetujuan Admin`,
    ``,
    `Pengguna baru telah mendaftar di COPM:`,
    `- Nama: ${newUserFullName}`,
    `- Email: ${newUserEmail}`,
    `- Peran: ${newUserRole}`,
    ``,
    `Buka panel persetujuan: ${appUrl}`,
  ].join('\n');

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fdfdfd; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 12px;">
        <span style="font-size: 18px; font-weight: 700; color: #1e1e1e; letter-spacing: -0.5px;">COPM</span>
        <span style="font-size: 13px; color: #6e6e6e; margin-left: 8px;">Pendaftaran Anggota Baru</span>
      </div>
      <h2 style="font-size: 16px; font-weight: 600; color: #1e1e1e; margin-top: 0;">
        Pendaftaran Memerlukan Persetujuan
      </h2>
      <p style="font-size: 14px; color: #444; line-height: 1.5;">
        Pengguna baru telah mendaftar di platform COPM dan menunggu verifikasi Admin:
      </p>
      <div style="margin: 20px 0; padding: 16px; background: #fafafa; border-radius: 6px; border: 1px solid #eaeaea;">
        <div style="font-size: 13px; margin-bottom: 6px;"><strong>Nama:</strong> ${newUserFullName}</div>
        <div style="font-size: 13px; margin-bottom: 6px;"><strong>Email:</strong> ${newUserEmail}</div>
        <div style="font-size: 13px;"><strong>Peran yang Diminta:</strong> <span style="text-transform: capitalize;">${newUserRole}</span></div>
      </div>
      <div style="margin-top: 24px;">
        <a href="${appUrl}" style="display: inline-block; background: #7b2cbf; color: #ffffff; padding: 10px 18px; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px;">Buka Panel Approval COPM</a>
      </div>
    </div>
  `;

  try {
    const fromAddress = process.env.SMTP_FROM || 'COPM <notifications@example.com>';
    await Promise.all(
      adminEmails.map((adminEmail) =>
        transporter.sendMail({
          from: fromAddress,
          to: adminEmail,
          replyTo: newUserEmail,
          subject: `[COPM] Pendaftaran User Baru: ${newUserFullName} (${newUserRole})`,
          text: textContent,
          html: htmlContent,
          headers: {
            'X-Entity-Ref-ID': `copm-signup-${Date.now()}`,
          },
        })
      )
    );
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Gagal mengirim email' };
  }
}

export async function sendPasswordResetEmail({
  userEmail,
  resetLink,
}: {
  userEmail: string;
  resetLink: string;
}): Promise<{ success: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log(`[COPM SMTP Mock] Reset password link for ${userEmail}: ${resetLink}`);
    return { success: true };
  }

  const textContent = [
    `COPM — Reset Kata Sandi`,
    `Permintaan Atur Ulang Kata Sandi Akun`,
    ``,
    `Kami menerima permintaan untuk mengatur ulang kata sandi akun COPM Anda.`,
    `Tautan reset: ${resetLink}`,
    ``,
    `Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini. Tautan ini bersifat rahasia dan akan kedaluwarsa demi keamanan.`,
  ].join('\n');

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fdfdfd; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 12px;">
        <span style="font-size: 18px; font-weight: 700; color: #1e1e1e; letter-spacing: -0.5px;">COPM</span>
        <span style="font-size: 13px; color: #6e6e6e; margin-left: 8px;">Reset Kata Sandi</span>
      </div>
      <h2 style="font-size: 16px; font-weight: 600; color: #1e1e1e; margin-top: 0;">
        Permintaan Atur Ulang Kata Sandi Akun
      </h2>
      <p style="font-size: 14px; color: #444; line-height: 1.5;">
        Kami menerima permintaan untuk mengatur ulang kata sandi akun COPM Anda. Klik tombol di bawah ini untuk melanjutkan:
      </p>
      <div style="margin: 24px 0;">
        <a href="${resetLink}" style="display: inline-block; background: #0d99ff; color: #ffffff; padding: 10px 18px; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px;">Atur Ulang Kata Sandi</a>
      </div>
      <p style="font-size: 12px; color: #777; line-height: 1.5;">
        Jika tombol di atas tidak berfungsi, salin dan tempel tautan berikut ke peramban Anda:<br />
        <a href="${resetLink}" style="color: #0d99ff; word-break: break-all;">${resetLink}</a>
      </p>
      <div style="margin-top: 32px; font-size: 11px; color: #999; border-top: 1px solid #f0f0f0; padding-top: 12px;">
        Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini. Tautan ini bersifat rahasia dan akan kedaluwarsa demi keamanan.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'COPM <notifications@example.com>',
      to: userEmail,
      subject: '[COPM] Permintaan Reset Kata Sandi Akun',
      text: textContent,
      html: htmlContent,
      headers: {
        'X-Entity-Ref-ID': `copm-reset-${Date.now()}`,
      },
    });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal mengirim email reset kata sandi';
    console.error('Error sending password reset email:', message);
    return { success: false, error: message };
  }
}

export async function sendUserApprovalEmail({
  userEmail,
  userFullName,
  isApproved,
  role,
}: {
  userEmail: string;
  userFullName: string;
  isApproved: boolean;
  role?: string;
}): Promise<{ success: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log(
      `[COPM SMTP Mock] Status Akun untuk ${userFullName} (${userEmail}): ${isApproved ? `Disetujui sebagai ${role}` : 'Ditolak'}`
    );
    return { success: true };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fdfdfd; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 12px;">
        <span style="font-size: 18px; font-weight: 700; color: #1e1e1e; letter-spacing: -0.5px;">COPM</span>
        <span style="font-size: 13px; color: #6e6e6e; margin-left: 8px;">Status Verifikasi Akun</span>
      </div>
      <h2 style="font-size: 16px; font-weight: 600; color: ${isApproved ? '#0d99ff' : '#ef4444'}; margin-top: 0;">
        ${isApproved ? 'Akun Anda Telah Disetujui! 🎉' : 'Permohonan Akun Tidak Disetujui'}
      </h2>
      <p style="font-size: 14px; color: #444; line-height: 1.5;">
        Halo <strong>${userFullName}</strong>,
      </p>
      <p style="font-size: 14px; color: #444; line-height: 1.5;">
        ${
          isApproved
            ? `Admin telah menyetujui akun Anda sebagai <strong>${role}</strong>. Anda sekarang dapat login dan mengakses seluruh alur kerja papan COPM.`
            : `Mohon maaf, permohonan pendaftaran akun Anda untuk platform COPM belum dapat disetujui pada saat ini.`
        }
      </p>
      ${
        isApproved
          ? `<div style="margin-top: 24px;">
              <a href="${appUrl}/login" style="display: inline-block; background: #0d99ff; color: #ffffff; padding: 10px 18px; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px;">Masuk ke COPM</a>
            </div>`
          : ''
      }
    </div>
  `;

  const textContent = [
    `COPM — Status Verifikasi Akun`,
    ``,
    `Halo ${userFullName},`,
    ``,
    isApproved
      ? `Akun Anda telah disetujui sebagai ${role}. Anda sekarang dapat masuk ke board COPM: ${appUrl}/login`
      : `Mohon maaf, permohonan pendaftaran akun Anda untuk platform COPM belum dapat disetujui saat ini.`,
  ].join('\n');

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'COPM <notifications@example.com>',
      to: userEmail,
      subject: `[COPM] ${isApproved ? 'Akun Anda Telah Disetujui' : 'Status Pendaftaran Akun'}`,
      text: textContent,
      html: htmlContent,
      headers: {
        'X-Entity-Ref-ID': `copm-approval-${Date.now()}`,
      },
    });
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Gagal mengirim email' };
  }
}

