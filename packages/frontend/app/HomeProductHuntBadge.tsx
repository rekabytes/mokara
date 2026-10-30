import Image from "next/image";

export function HomeProductHuntBadge({ className }: { className?: string }) {
  return (
    <a
      className={className}
      href="https://www.producthunt.com/products/mokara?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-mokara"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Image
        src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1298818&theme=light&t=1793384416894"
        alt="Mokara - A shared workspace for your team | Product Hunt"
        width={250}
        height={54}
        unoptimized
      />
      <span className="sr-only">Opens in a new tab</span>
    </a>
  );
}
