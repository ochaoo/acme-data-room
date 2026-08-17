import { ShareResourceType } from '../enums';

export interface AccessScope {
  resourceType: ShareResourceType;
  resourceId: string;
}
