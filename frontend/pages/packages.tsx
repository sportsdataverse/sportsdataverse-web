import Head from 'next/head'
import PackageCard from '@components/PackageCard'
import Image from 'next/image'
import sdvBlue from '@public/images/sdv-blue-banner.png'
import {
  FadeContainer,
  headingFromLeft,
  popUp,
} from "@content/FramerMotionVariants";
import { motion } from "motion/react";
import MetaData from "@components/MetaData";
import pageMeta from "@content/meta";

export default function Index({
    rPackages,
    rversePackages,
    pyPackages,
    jsPackages }:
    { rPackages: any,
      rversePackages: any,
      pyPackages: any,
      jsPackages: any }) {
  return (
    <>
        <Head>
            <title>{`SportsDataverse`}</title>
        </Head>
        <MetaData
        title={pageMeta.packages.title}
        description={pageMeta.packages.description}
        previewImage={pageMeta.packages.image}
        keywords={pageMeta.packages.keywords}
      />
        <div className="relative max-w-4xl mx-auto dark:bg-darkPrimary dark:text-gray-100 2xl:max-w-5xl 3xl:max-w-7xl">
        <motion.section
          initial="hidden"
          whileInView="visible"
          variants={FadeContainer}
          viewport={{ once: true }}
          className="grid min-h-screen py-20 place-content-center"
        >
            <motion.div
              variants={popUp}
              className="flex items-center justify-center p-5 "
            >
              <Image
                src={sdvBlue}
                className="p-10 shadow filter saturate-0.5"
                alt="cover Profile Image"
                quality={75}
                priority
              />
            </motion.div>
            <motion.h2
                  variants={headingFromLeft}
                  className="flex justify-center bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-3xl font-bold text-transparent lg:text-4xl font-sarina"
                >
                Python Packages
            </motion.h2>
            <motion.div variants={headingFromLeft}
              className="flex items-center justify-center p-5 ">
                {pyPackages.length === 0 ? (
                <h3 className="text-3xl mb-3 leading-snug">
                    No added Python packages
                </h3>
                ) : (
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {pyPackages.map((pkg: any, i: number) => (
                        <PackageCard pkg={pkg} key={i} />
                    ))}
                </div>
                )}
            </motion.div>
            <motion.h2
                  variants={headingFromLeft}
                  className="flex justify-center bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-3xl font-bold text-transparent lg:text-4xl font-sarina"
                >
                R Packages
            </motion.h2>
            <motion.div variants={headingFromLeft}
              className="flex items-center justify-center p-5 ">
                {rversePackages.length === 0 ? (
                <h3 className="text-3xl mb-3 leading-snug">
                    No added R packages
                </h3>
                ) : (
                <div className="grid w-full grid-cols-1 gap-2">
                    {rversePackages.map((pkg: any, i: number) => (
                        <PackageCard pkg={pkg} key={i} />
                    ))}
                </div>
                )}
            </motion.div>
            <motion.div variants={headingFromLeft}
              className="flex items-center justify-center p-5 ">
                {rPackages.length === 0 ? (
                <h3 className="text-3xl mb-3 leading-snug">
                    No added R packages
                </h3>
                ) : (
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {rPackages.map((pkg: any, i: number) => (
                        <PackageCard pkg={pkg} key={i} />
                    ))}
                </div>
                )}
            </motion.div>
            <motion.h2
                  variants={headingFromLeft}
                  className="flex justify-center bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-3xl font-bold text-transparent lg:text-4xl font-sarina"
                >
                Node.js Packages
            </motion.h2>
            <motion.div variants={headingFromLeft}
              className="flex items-center justify-center p-5 ">
                {jsPackages.length === 0 ? (
                <h3 className="text-3xl mb-3 leading-snug">
                    No added Node.js packages
                </h3>
                ) : (
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {jsPackages.map((pkg: any, i: number) => (
                        <PackageCard pkg={pkg} key={i} />
                    ))}
                </div>
                )}
            </motion.div>
        </motion.section>
        </div>
    </>
  )
}

export async function getServerSideProps(_ctx: any) {
  // get the current environment
  const dev = process.env.NODE_ENV !== 'production'
  const { DEV_URL, PROD_URL } = process.env

  // Request packages from the internal API (MongoDB-backed). Harden against a
  // failed request / non-array payload so an API hiccup renders empty sections
  // instead of throwing a 500 in getServerSideProps.
  let pkgs: any[] = []
  try {
    const response = await fetch(`${dev ? DEV_URL : PROD_URL}/api/packages`)
    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data?.message)) pkgs = data.message
    }
  } catch {
    pkgs = []
  }

  const pyPackages = pkgs.filter((pkg: any) => pkg.repoType == 'Python')
  const rPackages = pkgs.filter((pkg: any) => pkg.repoType == 'R' && pkg.title != 'sportsdataverse')
  const rversePackages = pkgs.filter((pkg: any) => pkg.repoType == 'R' && pkg.title == 'sportsdataverse')
  const jsPackages = pkgs.filter((pkg: any) => pkg.repoType == 'Node.js')
  return {
    props: {
      rPackages: rPackages,
      rversePackages: rversePackages,
      pyPackages: pyPackages,
      jsPackages: jsPackages,
    },
  }
}
