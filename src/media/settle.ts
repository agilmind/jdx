/**
 * Lo que corre a la vez sobre la carpeta de la entrega. settleAll espera a que
 * terminen todas las tareas y después, si alguna falló, lanza la primera falla
 * en el orden de la lista: cuando algo falla, nada de lo que empezó sigue
 * leyendo, ni con archivos abiertos, después de que se informa.
 */
export async function settleAll<T>(work: readonly Promise<T>[]): Promise<T[]> {
  const outcomes = await Promise.allSettled(work);
  const failed = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
  if (failed !== undefined) throw failed.reason;
  return outcomes.map((o) => (o as PromiseFulfilledResult<T>).value);
}
