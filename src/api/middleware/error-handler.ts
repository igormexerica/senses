import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  FieldApiError,
  FieldAuthError,
  FieldNotFoundError,
  FieldValidationError,
} from '../../lib/field-control.js';

interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    const log = req.log;

    // 1) Zod validation errors → 400
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      log.warn({ err: { name: err.name }, details }, 'validation_error');
      reply.code(400).send({
        error: 'validation_error',
        message: 'Payload inválido.',
        details,
      } satisfies ErrorResponse);
      return;
    }

    // 2) Field Control domain errors
    if (err instanceof FieldValidationError) {
      log.warn({ err: serializeError(err), errors: err.errors }, 'field_validation_error');
      reply.code(422).send({
        error: 'field_validation_error',
        message: err.message,
        details: err.errors,
      } satisfies ErrorResponse);
      return;
    }
    if (err instanceof FieldAuthError) {
      log.error({ err: serializeError(err) }, 'field_auth_error');
      reply.code(502).send({
        error: 'field_auth_error',
        message: 'Falha de autenticação no Field Control (upstream).',
      } satisfies ErrorResponse);
      return;
    }
    if (err instanceof FieldNotFoundError) {
      log.warn({ err: serializeError(err) }, 'field_not_found');
      reply.code(404).send({
        error: 'field_not_found',
        message: err.message,
      } satisfies ErrorResponse);
      return;
    }
    if (err instanceof FieldApiError) {
      log.error({ err: serializeError(err), body: err.body }, 'field_api_error');
      reply.code(502).send({
        error: 'field_api_error',
        message: `Field Control upstream error: ${err.message}`,
      } satisfies ErrorResponse);
      return;
    }

    // 3) Fastify-emitted errors with statusCode (e.g. 4xx do @fastify/sensible)
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      log.warn({ err: serializeError(err) }, 'client_error');
      reply.code(err.statusCode).send({
        error: err.code ?? 'client_error',
        message: err.message,
      } satisfies ErrorResponse);
      return;
    }

    // 4) Unknown — never expose stack to client
    log.error({ err: serializeError(err) }, 'internal_error');
    reply.code(500).send({
      error: 'internal_error',
      message: 'Erro interno do servidor.',
    } satisfies ErrorResponse);
  });
}

function serializeError(err: Error): Record<string, unknown> {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
}
