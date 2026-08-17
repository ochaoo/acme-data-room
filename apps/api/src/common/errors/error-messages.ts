import { ERROR_CODE, ErrorCode } from './error-code';

export const PRODUCTION_ERROR_MESSAGE: Record<ErrorCode, string> = {
  [ERROR_CODE.ACCESS_DENIED]: 'You do not have access to this item.',
  [ERROR_CODE.AUTHENTICATION_REQUIRED]: 'Please sign in to continue.',
  [ERROR_CODE.FILE_NOT_FOUND]: 'The file is no longer available.',
  [ERROR_CODE.FOLDER_NOT_FOUND]: 'The folder is no longer available.',
  [ERROR_CODE.DATA_ROOM_NOT_FOUND]: 'The data room is no longer available.',
  [ERROR_CODE.SHARE_NOT_FOUND]: 'This shared link is no longer available.',
  [ERROR_CODE.SHARE_RECIPIENT_NOT_FOUND]: 'No registered user was found for that email address.',
  [ERROR_CODE.NAME_CONFLICT]: 'An item with this name already exists in this location.',
  [ERROR_CODE.INVALID_UPLOAD]: 'The upload could not be verified.',
  [ERROR_CODE.STORAGE_ERROR]: 'The file storage service is temporarily unavailable.',
  [ERROR_CODE.INTERNAL_ERROR]: 'Something went wrong. Please try again.',
};

export const DEVELOPMENT_ERROR_MESSAGE: Record<ErrorCode, string> = {
  ...PRODUCTION_ERROR_MESSAGE,
};
