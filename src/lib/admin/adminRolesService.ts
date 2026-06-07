export {
  cancelCampusAdmin,
  getAdminRole,
  getAdminRoles,
  getCampusesByTeam,
  getDistrictsForAdmin,
  getTeamsByDistrict,
  registerCampusAdmin,
  searchUsersForCampusManager,
  setActiveCampusAdminRole,
} from '../adminService';

export type {
  AdminRole,
  AdminRoleType,
  AdminUserSearchResult,
  CampusManagerSearchParams,
  CampusOptionViewRow,
  SelectOption,
  UserSearchResult,
} from '../adminService';
