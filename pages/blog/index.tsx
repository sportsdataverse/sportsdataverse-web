import { getSortedPostsData, getSortedTopics } from '../../src/lib/posts'
import { GetStaticPropsResult } from 'next'
import { PostData } from '../../src/types/posts'
import React, { ReactElement } from 'react'
import { Grid, Typography } from '@material-ui/core'
import Box from '@material-ui/core/Box'
import TopicsDisplay from '../../src/components/TopicsDisplay'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import { Preview } from '../../src/components/Preview'
import Head from 'next/head'
import { NAME, NAME_AND_DOMAIN } from '../../src/types/constants'

const Home = ({ postsData, sortedTopics }: { postsData: PostData[]; sortedTopics: string[] }): ReactElement => {
  const large = useMediaQuery('(min-width:700px)')

  return (
    <>
      <Head>
        <title>{NAME}: Building the SportsDataverse</title>
        <meta
          name="description"
          content={`${NAME} is the homepage of the SportsDataverse.`}
        />
      </Head>
      <Grid container>
        <Grid item xs={12} className={styles.headings}>
          <Box p={5}>
            <Typography variant={large ? 'h1' : 'h4'}>{NAME_AND_DOMAIN}</Typography>
            <Typography variant={large ? 'h3' : 'h6'}>
             Building the SportsDataverse.
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={12}>
          <TopicsDisplay topics={sortedTopics} n={5} />
        </Grid>
        <Grid item xs={12}>
          <Box pt={3}>
            <Preview posts={postsData} />
          </Box>
        </Grid>
      </Grid>
    </>
  )
}

export const getStaticProps = async (): Promise<
  GetStaticPropsResult<{
    postsData: PostData[]
    sortedTopics: string[]
  }>
> => {
  const sortedTopics = getSortedTopics()
  const postsData = getSortedPostsData()
  return {
    props: {
      postsData: postsData,
      sortedTopics,
    },
  }
}

export default Home
