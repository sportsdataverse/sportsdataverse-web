import Head from 'next/head'
import PackageCard from '@components/PackageCard'
import Grid from '@mui/material/Grid'
import Image from 'next/image'
import sdvBlue from '@public/images/sdv-blue-banner.png'
import {
  FadeContainer,
  headingFromLeft,
  opacityVariant,
  popUp,
} from "@content/FramerMotionVariants";
import { motion } from "framer-motion";

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
                // style={{
                //   maxWidth: "100%",
                //   height: "auto",
                // }}
              />
            </motion.div>
            <motion.h2
                  variants={headingFromLeft}
                  className="flex justify-center text-3xl font-bold lg:text-4xl font-sarina"
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
                <Grid container spacing={1}>
                    {pyPackages.map((pkg: any, i: number) => (
                    <Grid item xs={12} sm={6} md={6} lg={4} key={i}>
                        <PackageCard pkg={pkg} key={i} />
                    </Grid>
                    ))}
                </Grid>
                )}
            </motion.div>
            <motion.h2
                  variants={headingFromLeft}
                  className="flex justify-center text-3xl font-bold lg:text-4xl font-sarina"
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
                <Grid container
                    spacing={1}>
                    {rversePackages.map((pkg: any, i: number) => (
                    <Grid item xs={12} sm={12} md={12} lg={12} key={i}>
                    <PackageCard pkg={pkg} key={i} />
                    </Grid>
                    ))}
                </Grid>
                )}
            </motion.div>
            <motion.div variants={headingFromLeft}
              className="flex items-center justify-center p-5 ">
                {rPackages.length === 0 ? (
                <h3 className="text-3xl mb-3 leading-snug">
                    No added R packages
                </h3>
                ) : (
                <Grid container
                    spacing={1}>
                    {rPackages.map((pkg: any, i: number) => (
                    <Grid item xs={12} sm={6} md={6} lg={4} key={i}>
                    <PackageCard pkg={pkg} key={i} />
                    </Grid>
                    ))}
                </Grid>
                )}
            </motion.div>
            <motion.h2
                  variants={headingFromLeft}
                  className="flex justify-center text-3xl font-bold lg:text-4xl font-sarina"
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
                <Grid container
                    spacing={1}>
                    {jsPackages.map((pkg: any, i: number) => (
                    <Grid item xs={12} sm={6} md={6} lg={4} key={i}>
                    <PackageCard pkg={pkg} key={i} />
                    </Grid>
                    ))}
                </Grid>
                )}
            </motion.div>
        </motion.section>
        </div>
    </>
  )
}

export async function getServerSideProps(_ctx: any) {
  // get the current environment
  let dev = process.env.NODE_ENV !== 'production'
  let { DEV_URL, PROD_URL } = process.env

  // request posts from api
  let response = await fetch(`${dev ? DEV_URL : PROD_URL}/api/packages`)
  // extract the data
  let data = await response.json()
  let pyPackages = data['message'].filter((pkg: any)  => pkg.repoType == 'Python')
  let rPackages = data['message'].filter((pkg: any) => pkg.repoType == 'R' && pkg.title != 'sportsdataverse')
  let rversePackages = data['message'].filter((pkg: any) => pkg.repoType == 'R' && pkg.title == 'sportsdataverse')
  let jsPackages = data['message'].filter((pkg: any) => pkg.repoType == 'Node.js')
  // console.log(rversePackages)
  return {
    props: {
      rPackages: rPackages,
      rversePackages: rversePackages,
      pyPackages: pyPackages,
      jsPackages: jsPackages,
    },
  }
}
