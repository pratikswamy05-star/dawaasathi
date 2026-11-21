import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute, { HOME } from './components/ProtectedRoute';
import Toaster from './components/Toaster';
import { AdminDashboard, AdminUsers } from './pages/admin/AdminPages';
import Ask from './pages/Ask';
import { LoginChooser, PortalLogin } from './pages/auth/Login';
import Register from './pages/auth/Register';
import CaregiverDashboard from './pages/caregiver/CaregiverDashboard';
import PatientDetail from './pages/PatientDetail';
import Pharmacy from './pages/Pharmacy';
import PillScan from './pages/PillScan';
import Reminders from './pages/Reminders';
import Report from './pages/Report';
import Teleconsults from './pages/Teleconsults';
import PatientVitals from './pages/Vitals';
import { PatientDashboard, PatientHistory, PatientMedicines, PatientRefills, PatientToday } from './pages/patient/PatientPages';
import { AshaDashboard, DoctorDashboard, DoctorPrescriptions, DoctorReports, StaffAlerts, StaffPatients } from './pages/staff/StaffPages';
import { useAuth } from './store/auth';
import type { Role } from './types';

const guard = (roles: Role[], el: JSX.Element) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>;

function Home() {
  const user = useAuth((s) => s.user);
  return <Navigate to={user ? HOME[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <>
      <Toaster />
      <Routes>
        <Route path="/login" element={<LoginChooser />} />
        <Route path="/login/patient" element={<PortalLogin key="patient" portal="patient" />} />
        <Route path="/login/caregiver" element={<PortalLogin key="caregiver" portal="caregiver" />} />
        <Route path="/login/asha" element={<PortalLogin key="asha" portal="asha" />} />
        <Route path="/login/staff" element={<PortalLogin key="staff" portal="staff" />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Home />} />

        <Route element={guard(['patient', 'caregiver', 'asha', 'doctor', 'admin'], <AppShell />)}>
          <Route path="/patient/dashboard" element={guard(['patient'], <PatientDashboard />)} />
          <Route path="/patient/today" element={guard(['patient'], <PatientToday />)} />
          <Route path="/patient/medicines" element={guard(['patient'], <PatientMedicines />)} />
          <Route path="/patient/history" element={guard(['patient'], <PatientHistory />)} />
          <Route path="/patient/refills" element={guard(['patient'], <PatientRefills />)} />
          <Route path="/patient/ask" element={guard(['patient'], <Ask />)} />
          <Route path="/patient/vitals" element={guard(['patient'], <PatientVitals />)} />
          <Route path="/patient/doctor" element={guard(['patient'], <Teleconsults />)} />
          <Route path="/patient/scan" element={guard(['patient'], <PillScan />)} />
          <Route path="/patient/pharmacy" element={guard(['patient'], <Pharmacy />)} />
          <Route path="/patient/report" element={guard(['patient'], <Report />)} />
          <Route path="/patient/reminders" element={guard(['patient'], <Reminders />)} />
          <Route path="/caregiver/reminders" element={guard(['caregiver'], <Reminders />)} />
          <Route path="/asha/reminders" element={guard(['asha'], <Reminders />)} />
          <Route path="/doctor/reminders" element={guard(['doctor', 'admin'], <Reminders />)} />

          <Route path="/caregiver/dashboard" element={guard(['caregiver'], <CaregiverDashboard />)} />
          <Route path="/caregiver/ask" element={guard(['caregiver'], <Ask />)} />
          <Route path="/caregiver/doctor" element={guard(['caregiver'], <Teleconsults />)} />
          <Route path="/caregiver/scan" element={guard(['caregiver'], <PillScan />)} />
          <Route path="/caregiver/pharmacy" element={guard(['caregiver'], <Pharmacy />)} />

          <Route path="/asha/dashboard" element={guard(['asha', 'admin'], <AshaDashboard />)} />
          <Route path="/asha/patients" element={guard(['asha', 'admin'], <StaffPatients />)} />
          <Route path="/asha/alerts" element={guard(['asha', 'admin'], <StaffAlerts />)} />
          <Route path="/asha/doctor" element={guard(['asha'], <Teleconsults />)} />
          <Route path="/asha/scan" element={guard(['asha'], <PillScan />)} />
          <Route path="/asha/pharmacy" element={guard(['asha'], <Pharmacy />)} />

          <Route path="/doctor/dashboard" element={guard(['doctor', 'admin'], <DoctorDashboard />)} />
          <Route path="/doctor/patients" element={guard(['doctor', 'admin'], <StaffPatients title="My patients" />)} />
          <Route path="/doctor/prescriptions" element={guard(['doctor', 'admin'], <DoctorPrescriptions />)} />
          <Route path="/doctor/reports" element={guard(['doctor', 'asha', 'admin'], <DoctorReports />)} />
          <Route path="/doctor/teleconsults" element={guard(['doctor', 'admin'], <Teleconsults />)} />
          <Route path="/doctor/scan" element={guard(['doctor', 'admin'], <PillScan />)} />

          <Route path="/admin/dashboard" element={guard(['admin'], <AdminDashboard />)} />
          <Route path="/admin/users" element={guard(['admin'], <AdminUsers />)} />

          <Route path="/patients/:id" element={guard(['caregiver', 'asha', 'doctor', 'admin'], <PatientDetail />)} />
          <Route path="/patients/:id/report" element={guard(['caregiver', 'asha', 'doctor', 'admin'], <Report />)} />
        </Route>

        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}
