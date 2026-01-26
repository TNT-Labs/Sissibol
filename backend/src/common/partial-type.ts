import { Type } from '@nestjs/common';

/**
 * Utility locale per creare un tipo parziale (tutte le proprietà opzionali)
 * Alternativa a @nestjs/mapped-types per evitare problemi di build
 */
export function PartialType<T>(classRef: Type<T>): Type<Partial<T>> {
  abstract class PartialTypeClass {}

  const propertyKeys = Object.getOwnPropertyNames(classRef.prototype);

  for (const key of propertyKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(classRef.prototype, key);
    if (descriptor) {
      Object.defineProperty(PartialTypeClass.prototype, key, descriptor);
    }
  }

  return PartialTypeClass as Type<Partial<T>>;
}
