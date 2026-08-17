import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode } from './error-code';

export class ApiException extends HttpException {
  constructor(status: HttpStatus, errorCode: ErrorCode) {
    super({ errorCode }, status);
  }
}
