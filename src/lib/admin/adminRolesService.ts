export {
  assignCampusAdmin,
  cancelCampusAdmin,
  getAdminRole,
  getAllDistricts,
  getCampusesByTeam,
  getCampusAdminByCampus,
  getDistrictsForAdmin,
  getTeamsByDistrict,
  registerCampusAdmin,
  removeCampusAdmin,
  searchUsersForAdmin,
  searchUsersForCampusManager,
  setAdminRole,
} from '../adminService';

export type {
  AdminRole,
  AdminRoleType,
  AdminUserSearchResult,
  CampusAdminRole,
  CampusManagerSearchParams,
  CampusOptionViewRow,
  SelectOption,
  UserSearchResult,
} from '../adminService';
