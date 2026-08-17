import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

import { ErrorCode, ERROR_CODE } from '../errors/error-code';
import { DEVELOPMENT_ERROR_MESSAGE, PRODUCTION_ERROR_MESSAGE } from '../errors/error-messages';

interface ExceptionResponse {
  errorCode?: ErrorCode;
  message?: string | string[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException ? (exception.getResponse() as ExceptionResponse) : {};
    const errorCode = exceptionResponse.errorCode;
    const isProduction = process.env.NODE_ENV === 'production';
    const knownMessage = errorCode
      ? (isProduction ? PRODUCTION_ERROR_MESSAGE : DEVELOPMENT_ERROR_MESSAGE)[errorCode]
      : undefined;
    const message = knownMessage ?? exceptionResponse.message ?? PRODUCTION_ERROR_MESSAGE[ERROR_CODE.INTERNAL_ERROR];

    if (!isHttpException) {
      console.error('Unhandled application error', exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
