"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { homepageBadgeFloat } from "@/lib/motion";
import { HomeProductHuntBadge } from "./HomeProductHuntBadge";

export function HomeDirectoryBadge() {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className="home-directory public-container"
      initial={false}
      animate="rest"
      whileInView={reducedMotion ? "rest" : "float"}
      viewport={{ amount: 0.5 }}
    >
      <motion.a
        href="https://makakami.com.my/app/mokara"
        target="_blank"
        rel="noopener noreferrer"
        variants={homepageBadgeFloat}
      >
        <Image
          src="https://makakami.com.my/badge/mokara.svg"
          alt="Listed on MakaKami"
          width={165}
          height={44}
          unoptimized
        />
        <span className="sr-only">Opens in a new tab</span>
      </motion.a>
      <motion.div variants={homepageBadgeFloat}>
        <HomeProductHuntBadge />
      </motion.div>
    </motion.div>
  );
}
