import Image from "next/image";

/** The same SVG supplies the public wordmark and browser icon. */
export function BrandMark() {
  return <Image src="/mokara-mark.svg" width={32} height={32} alt="" unoptimized aria-hidden />;
}
