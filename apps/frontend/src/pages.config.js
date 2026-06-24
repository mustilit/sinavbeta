/**
 * pages.config.js - Page routing configuration
 *
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 *
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 *
 * Example file structure:
 *
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 *
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import { lazy } from 'react';
import __Layout from './Layout.jsx';

const About = lazy(() => import('./pages/About'));
const AdminAdReport = lazy(() => import('./pages/AdminAdReport'));
const AdminAdPackages = lazy(() => import('./pages/AdminAdPackages'));
const ManagePackages = lazy(() => import('./pages/ManagePackages'));
const AdminUserActivity = lazy(() => import('./pages/AdminUserActivity'));
const AdminClaims = lazy(() => import('./pages/AdminClaims'));
const AdminRevenue = lazy(() => import('./pages/AdminRevenue'));
const AdminCandidateReport = lazy(() => import('./pages/AdminCandidateReport'));
const AdminCommissionReport = lazy(() => import('./pages/AdminCommissionReport'));
const AdminSystemControls = lazy(() => import('./pages/AdminSystemControls'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminEducatorReport = lazy(() => import('./pages/AdminEducatorReport'));
const AdminObjections = lazy(() => import('./pages/AdminObjections'));
const CompleteProfile = lazy(() => import('./pages/CompleteProfile'));
const Contact = lazy(() => import('./pages/Contact'));
const CreateTest = lazy(() => import('./pages/CreateTest'));
const EditTest = lazy(() => import('./pages/EditTest'));
const EducatorDashboard = lazy(() => import('./pages/EducatorDashboard'));
const EducatorProfile = lazy(() => import('./pages/EducatorProfile'));
const EducatorRefunds = lazy(() => import('./pages/EducatorRefunds'));
const EducatorSettings = lazy(() => import('./pages/EducatorSettings'));
const Educators = lazy(() => import('./pages/Educators'));
const ExamTypes = lazy(() => import('./pages/ExamTypes'));
const GradeLevels = lazy(() => import('./pages/GradeLevels'));
const Explore = lazy(() => import('./pages/Explore'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Home = lazy(() => import('./pages/Home'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const EducatorOnboarding = lazy(() => import('./pages/EducatorOnboarding'));
const DeviceVerify = lazy(() => import('./pages/DeviceVerify'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ManageExamTypes = lazy(() => import('./pages/ManageExamTypes'));
const ManageGradeLevels = lazy(() => import('./pages/ManageGradeLevels'));
// Sprint 16 — Sınav Türleri + Soru Konuları tek sayfada iki sekme
const ContentManagement = lazy(() => import('./pages/ContentManagement'));
const ManageRefunds = lazy(() => import('./pages/ManageRefunds'));
const ManageTests = lazy(() => import('./pages/ManageTests'));
const ManageTopics = lazy(() => import('./pages/ManageTopics'));
const ManageUsers = lazy(() => import('./pages/ManageUsers'));
const MyAds = lazy(() => import('./pages/MyAds'));
const MyDiscountCodes = lazy(() => import('./pages/MyDiscountCodes'));
const MyResults = lazy(() => import('./pages/MyResults'));
const MyTopicReport = lazy(() => import('./pages/MyTopicReport'));
const MySales = lazy(() => import('./pages/MySales'));
const MyTestPackages = lazy(() => import('./pages/MyTestPackages'));
const MyTests = lazy(() => import('./pages/MyTests'));
const Partnership = lazy(() => import('./pages/Partnership'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Privacy = lazy(() => import('./pages/Privacy'));
const ProfileSettings = lazy(() => import('./pages/ProfileSettings'));
const QuestionReports = lazy(() => import('./pages/QuestionReports'));
const MyObjections = lazy(() => import('./pages/MyObjections'));
const MyNotes = lazy(() => import('./pages/MyNotes'));
const CreateTunnel = lazy(() => import('./pages/CreateTunnel'));
const ManageTunnels = lazy(() => import('./pages/ManageTunnels'));
const AdminTunnels = lazy(() => import('./pages/AdminTunnels'));
const TakeTunnel = lazy(() => import('./pages/TakeTunnel'));
const TunnelDetail = lazy(() => import('./pages/TunnelDetail'));
const TakeWrittenTest = lazy(() => import('./pages/TakeWrittenTest'));
const WrittenTestDetail = lazy(() => import('./pages/WrittenTestDetail'));
const SelectExamTypes = lazy(() => import('./pages/SelectExamTypes'));
const Support = lazy(() => import('./pages/Support'));
const TakeTest = lazy(() => import('./pages/TakeTest'));
const TestDetail = lazy(() => import('./pages/TestDetail'));
const LiveSessionCreate = lazy(() => import('./pages/LiveSessionCreate'));
const LiveSessionHost = lazy(() => import('./pages/LiveSessionHost'));
const LiveSessionJoin = lazy(() => import('./pages/LiveSessionJoin'));
const ManageLiveTiers = lazy(() => import('./pages/ManageLiveTiers'));
const MyLiveSessions = lazy(() => import('./pages/MyLiveSessions'));
// Email Trafiği Modülü
const EmailDashboard = lazy(() => import('./pages/EmailDashboard'));
const EmailKillSwitches = lazy(() => import('./pages/EmailKillSwitches'));
const EmailProviders = lazy(() => import('./pages/EmailProviders'));
const EmailLogs = lazy(() => import('./pages/EmailLogs'));
const EmailLogDetail = lazy(() => import('./pages/EmailLogDetail'));
const EmailTemplates = lazy(() => import('./pages/EmailTemplates'));
const EmailSuppressions = lazy(() => import('./pages/EmailSuppressions'));
const EmailPreferences = lazy(() => import('./pages/EmailPreferences'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
// Sprint 14 — Public yasal metin sayfası (4 slug paylaşır)
const LegalDocument = lazy(() => import('./pages/LegalDocument'));
// Sprint 15 — Admin platform promo kodu yönetimi
const ManagePromoCodes = lazy(() => import('./pages/ManagePromoCodes'));
// Sprint 16 — Admin yasal sözleşme yönetimi (düzenle / versiyonla / aktif yap)
const ManageContracts = lazy(() => import('./pages/ManageContracts'));
const EmailManagement = lazy(() => import('./pages/EmailManagement'));
// İçerik Moderasyonu
const ModerationQueue = lazy(() => import('./pages/ModerationQueue'));
const RiskyEducators = lazy(() => import('./pages/RiskyEducators'));
const BlockedTerms = lazy(() => import('./pages/BlockedTerms'));
const ModerationResultDetail = lazy(() => import('./pages/ModerationResultDetail'));
const EducatorViolationDetail = lazy(() => import('./pages/EducatorViolationDetail'));
const ModerationSettings = lazy(() => import('./pages/ModerationSettings'));
const MyModerationStatus = lazy(() => import('./pages/MyModerationStatus'));
const RiskyContent = lazy(() => import('./pages/RiskyContent'));
// Yedekleme Yönetimi
const BackupManagement = lazy(() => import('./pages/BackupManagement'));
// Yazılı test modülü — eğitici
const CreateWrittenTest = lazy(() => import('./pages/CreateWrittenTest'));
const EditWrittenTest = lazy(() => import('./pages/EditWrittenTest'));
const ManageWrittenTests = lazy(() => import('./pages/ManageWrittenTests'));
// E-Sınıf (Okul) modülü — Sprint 1
const AdminSchools = lazy(() => import('./pages/AdminSchools'));
const SchoolPanel = lazy(() => import('./pages/SchoolPanel'));
const SchoolUsers = lazy(() => import('./pages/SchoolUsers'));
const SchoolBranches = lazy(() => import('./pages/SchoolBranches'));
const SchoolDepartments = lazy(() => import('./pages/SchoolDepartments'));


export const PAGES = {
    "About": About,
    "AdminAdReport": AdminAdReport,
    "AdminAdPackages": AdminAdPackages,
    "ManagePackages": ManagePackages,
    "AdminUserActivity": AdminUserActivity,
    "AdminClaims": AdminClaims,
    "AdminRevenue": AdminRevenue,
    "AdminCandidateReport": AdminCandidateReport,
    "AdminCommissionReport": AdminCommissionReport,
    "AdminSystemControls": AdminSystemControls,
    "AdminDashboard": AdminDashboard,
    "AdminEducatorReport": AdminEducatorReport,
    "AdminObjections": AdminObjections,
    "CompleteProfile": CompleteProfile,
    "Contact": Contact,
    "CreateTest": CreateTest,
    "EditTest": EditTest,
    "EducatorDashboard": EducatorDashboard,
    "EducatorProfile": EducatorProfile,
    "EducatorRefunds": EducatorRefunds,
    "EducatorSettings": EducatorSettings,
    "Educators": Educators,
    "ExamTypes": ExamTypes,
    "GradeLevels": GradeLevels,
    "Explore": Explore,
    "ForgotPassword": ForgotPassword,
    "Home": Home,
    "Login": Login,
    "Register": Register,
    "ResetPassword": ResetPassword,
    "VerifyEmail": VerifyEmail,
    "EducatorOnboarding": EducatorOnboarding,
    "DeviceVerify": DeviceVerify,
    "ManageExamTypes": ManageExamTypes,
    "ManageGradeLevels": ManageGradeLevels,
    "ContentManagement": ContentManagement,
    "ManageRefunds": ManageRefunds,
    "ManageTests": ManageTests,
    "ManageTopics": ManageTopics,
    "ManageUsers": ManageUsers,
    "MyAds": MyAds,
    "MyDiscountCodes": MyDiscountCodes,
    "MyResults": MyResults,
    "MyTopicReport": MyTopicReport,
    "MySales": MySales,
    "MyTestPackages": MyTestPackages,
    "MyTests": MyTests,
    "Partnership": Partnership,
    "Pricing": Pricing,
    "Privacy": Privacy,
    "ProfileSettings": ProfileSettings,
    "QuestionReports": QuestionReports,
    "MyObjections": MyObjections,
    "MyNotes": MyNotes,
    "CreateTunnel": CreateTunnel,
    "ManageTunnels": ManageTunnels,
    "AdminTunnels": AdminTunnels,
    "TakeTunnel": TakeTunnel,
    "TunnelDetail": TunnelDetail,
    "TakeWrittenTest": TakeWrittenTest,
    "WrittenTestDetail": WrittenTestDetail,
    "SelectExamTypes": SelectExamTypes,
    "Support": Support,
    "TakeTest": TakeTest,
    "TestDetail": TestDetail,
    "LiveSessionCreate": LiveSessionCreate,
    "LiveSessionHost": LiveSessionHost,
    "LiveSessionJoin": LiveSessionJoin,
    "ManageLiveTiers": ManageLiveTiers,
    "MyLiveSessions": MyLiveSessions,
    "EmailDashboard": EmailDashboard,
    "EmailKillSwitches": EmailKillSwitches,
    "EmailProviders": EmailProviders,
    "EmailLogs": EmailLogs,
    "EmailLogDetail": EmailLogDetail,
    "EmailTemplates": EmailTemplates,
    "EmailSuppressions": EmailSuppressions,
    "EmailPreferences": EmailPreferences,
    "Unsubscribe": Unsubscribe,
    "LegalDocument": LegalDocument,
    "ManagePromoCodes": ManagePromoCodes,
    "ManageContracts": ManageContracts,
    "EmailManagement": EmailManagement,
    "ModerationQueue": ModerationQueue,
    "RiskyEducators": RiskyEducators,
    "BlockedTerms": BlockedTerms,
    "ModerationResultDetail": ModerationResultDetail,
    "EducatorViolationDetail": EducatorViolationDetail,
    "ModerationSettings": ModerationSettings,
    "MyModerationStatus": MyModerationStatus,
    "RiskyContent": RiskyContent,
    "BackupManagement": BackupManagement,
    "CreateWrittenTest": CreateWrittenTest,
    "EditWrittenTest": EditWrittenTest,
    "ManageWrittenTests": ManageWrittenTests,
    "AdminSchools": AdminSchools,
    "SchoolPanel": SchoolPanel,
    "SchoolUsers": SchoolUsers,
    "SchoolBranches": SchoolBranches,
    "SchoolDepartments": SchoolDepartments,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};
