/**
 * Las promesas que se rechazan sin que nadie las maneje mientras corre un
 * trabajo: unhandledDuring(work) corre `work`, espera a que termine (bien o
 * mal) y un rato más, y devuelve lo que se rechazó sin manejar y cómo terminó.
 */
export async function unhandledDuring(work: () => Promise<unknown>, wait = 100): Promise<{ unhandled: unknown[]; outcome: unknown }> {
  const unhandled: unknown[] = [];
  const listener = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', listener);
  try {
    const outcome = await work().then((value) => ({ value }), (error: unknown) => ({ error }));
    await new Promise((resolve) => setTimeout(resolve, wait));
    return { unhandled, outcome };
  } finally {
    process.off('unhandledRejection', listener);
  }
}
