// Maps AppError + ZodError + Prisma errors into a consistent JSON shape.
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: err.code,
        message: err.message,
        details: err.details,
      });
    }

    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: "validation_failed",
        message: "Request validation failed",
        details: err.flatten(),
      });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint, FK failure, etc.
      if (err.code === "P2002") {
        const target = (err.meta?.target as string[] | undefined)?.join(",") ?? "field";
        return reply.status(409).send({
          error: "conflict",
          message: `Unique constraint violation on ${target}`,
        });
      }
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "not_found", message: "Record not found" });
      }
    }

    // Fastify validation
    if (err && typeof err === "object" && "validation" in err && err.validation) {
      return reply.status(400).send({
        error: "validation_failed",
        message: err instanceof Error ? err.message : "Validation failed",
      });
    }

    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({
      error: "internal_error",
      message: "An internal error occurred",
    });
  });
};

export default fp(plugin, { name: "error-handler" });
