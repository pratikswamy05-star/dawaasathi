import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import VitalsPanel from '../components/VitalsPanel';
import { ErrorState, PageHeader } from '../components/ui';
import { useT } from '../i18n';
import { useAuth } from '../store/auth';

/** Patient's own health readings page (big text, voice feedback). */
export default function PatientVitals() {
  const { t } = useT();
  const patientId = useAuth((s) => s.user?.patientId ?? null);
  if (!patientId) return <ErrorState message="No patient record is linked to this account" />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`❤️ ${t('vitals')}`}
        action={
          <Link to="/patient/report" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-slate-300 px-4 font-bold text-navy-800 hover:bg-navy-50">
            <FileText className="h-5 w-5" aria-hidden /> {t('weeklyReport')}
          </Link>
        }
      />
      <VitalsPanel patientId={patientId} big />
    </div>
  );
}
