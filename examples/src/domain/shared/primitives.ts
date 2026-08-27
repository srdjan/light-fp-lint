// @light-fp prelude -- defines Result and handleThrow, so this is the one module
// that is allowed to catch. Everything else consumes the Result it returns.
// Shared helpers for the "good" examples so they remain concise and lint-friendly.
// Domain modules can import this prelude without crossing an adapter boundary.

export type Result<E, A> =
  | { readonly _tag: "Ok"; readonly value: A }
  | { readonly _tag: "Err"; readonly error: E };

export const ok = <E, A>(value: A): Result<E, A> => ({ _tag: "Ok", value });
export const err = <E, A>(error: E): Result<E, A> => ({ _tag: "Err", error });

export const map = <E, A, B>(
  result: Result<E, A>,
  fn: (value: A) => B,
): Result<E, B> => result._tag === "Ok" ? ok(fn(result.value)) : result;

export const chain = <E, A, B>(
  result: Result<E, A>,
  fn: (value: A) => Result<E, B>,
): Result<E, B> => result._tag === "Ok" ? fn(result.value) : result;

export type Effect<Name extends string, A> = {
  readonly effect: Name;
  readonly run: () => Promise<A>;
};

export type WithCapability<Name extends string, C, A> = Effect<Name, A> & {
  readonly capability: C;
};

export const brand = <Name extends string, A>(
  name: Name,
  run: () => Promise<A>,
): Effect<Name, A> => ({
  effect: name,
  run,
});

export const brandWithCapability = <Name extends string, C, A>(
  name: Name,
  capability: C,
  run: (cap: C) => Promise<A>,
): WithCapability<Name, C, A> => ({
  capability,
  ...brand(name, () => run(capability)),
});

export const withCapability = <C, A>(
  capability: C,
  run: (cap: C) => Promise<A>,
) => brandWithCapability("IO", capability, run);

export const raise = <E, A>(error: E): Result<E, A> => err(error);

export const handleThrow = async <E, A>(
  run: () => Promise<A>,
  onError: (cause: unknown) => E,
): Promise<Result<E, A>> => {
  try {
    return ok(await run());
  } catch (cause) {
    return err(onError(cause));
  }
};
