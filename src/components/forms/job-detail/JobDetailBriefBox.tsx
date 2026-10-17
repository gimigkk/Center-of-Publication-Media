import React, { useState } from 'react';
import { GoogleDocsIcon } from '@/components/ui/GoogleDocsIcon';
import { ExternalLink, Copy, Check } from 'lucide-react';

interface JobDetailBriefBoxProps {
  briefLink: string;
  displayTitle: string;
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  const docMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return `https://docs.google.com/document/d/${docMatch[1]}/preview`;

  const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetMatch) return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/preview`;

  const presMatch = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (presMatch) return `https://docs.google.com/presentation/d/${presMatch[1]}/preview`;

  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;

  return null;
}

export const JobDetailBriefBox = React.memo(function JobDetailBriefBox({
  briefLink,
  displayTitle,
}: JobDetailBriefBoxProps) {
  const [isCopied, setIsCopied] = useState(false);
  const embedUrl = getEmbedUrl(briefLink);

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (briefLink) {
      try {
        await navigator.clipboard.writeText(briefLink);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  return (
    <div className="simple-brief-section">
      <div className="simple-brief-box">
        <a
          href={briefLink}
          target="_blank"
          rel="noopener noreferrer"
          className="simple-brief-main-link"
          title={`Buka "${displayTitle}"`}
        >
          <GoogleDocsIcon size={18} />
          <span className="simple-brief-text" title={displayTitle}>
            {displayTitle}
          </span>
        </a>

        <div className="simple-brief-actions">
          <button
            type="button"
            className={`simple-brief-action-btn ${isCopied ? 'copied' : ''}`}
            onClick={handleCopyLink}
            title={isCopied ? 'Tautan berhasil disalin!' : 'Salin tautan brief'}
          >
            {isCopied ? (
              <>
                <Check size={12} strokeWidth={2.5} />
                <span>Tersalin!</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Salin</span>
              </>
            )}
          </button>

          <a
            href={briefLink}
            target="_blank"
            rel="noopener noreferrer"
            className="simple-brief-action-btn"
            title="Buka di tab baru"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {embedUrl && (
        <div className="simple-brief-preview-container">
          <iframe
            src={embedUrl}
            className="simple-brief-iframe"
            title={`Preview ${displayTitle}`}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
});
