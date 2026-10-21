import { z } from 'zod';
import { isAbsolute } from 'node:path';

const target = {
  name: z.string().min(1),
  role: z.string().min(1),
};

const editableRoles = z.enum(['textbox', 'searchbox', 'spinbutton']);
const selection = z.union([z.string(), z.array(z.string()).min(1)]);

const commandVariants = [
  z.object({
    operation: z.literal('click'),
    ...target,
  }).strict(),
  z.object({
    operation: z.literal('type'),
    ...target,
    role: editableRoles,
    value: z.string(),
  }).strict(),
  z.object({
    operation: z.literal('check'),
    ...target,
    role: z.enum(['checkbox', 'radio']),
    value: z.boolean(),
  }).strict(),
  z.object({
    operation: z.literal('select'),
    ...target,
    role: z.enum(['combobox', 'listbox']),
    value: selection,
    by: z.enum(['label', 'value']),
  }).strict(),
  z.object({
    operation: z.literal('press'),
    ...target,
    value: z.string().trim().min(1),
  }).strict(),
  z.object({
    operation: z.literal('focus'),
    ...target,
  }).strict(),
  z.object({
    operation: z.literal('hover'),
    ...target,
  }).strict(),
  z.object({
    operation: z.literal('clear'),
    ...target,
    role: editableRoles,
  }).strict(),
  z.object({
    operation: z.literal('upload'),
    ...target,
    value: z.array(z.string().refine(isAbsolute, {
      message: 'Upload paths must be absolute local file paths.',
    })).min(1),
  }).strict(),
];

export const commandSchema = z.discriminatedUnion('operation', commandVariants).refine(
  (command) => command.operation !== 'check' || command.role !== 'radio' || command.value,
  { message: 'A radio button can only be checked, not unchecked directly.' },
);

export const commandsSchema = z.array(commandSchema);

export const instructionSchema = z.discriminatedUnion('operation',
  commandVariants.map((variant) => variant.omit({ name: true, role: true }).extend({
    ref: z.string().min(1),
  })),
);

export const instructionsSchema = z.array(instructionSchema);
