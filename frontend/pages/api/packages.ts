import { NextApiRequest, NextApiResponse } from "next";

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { connectToDatabase } from '@lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // switch the methods
  switch (req.method) {
    case 'GET': {
      return getPkgs(req, res)
    }

    case 'POST': {
      return addPkg(req, res)
    }

    case 'PUT': {
      return updatePkg(req, res)
    }

    case 'DELETE': {
      return deletePkg(req, res)
    }
  }
}

// Getting all pkgs.
async function getPkgs(
  _req: NextApiRequest,
  res: NextApiResponse
  ) {
  try {
    let { db } = await connectToDatabase()
    let pkgs = await db.collection('packages').find({}).sort({ published: -1 }).toArray()
    return res.json({
      message: JSON.parse(JSON.stringify(pkgs)),
      success: true,
    })
  } catch (error: any) {
    return res.json({
      message: new Error(error).message,
      success: false,
    })
  }
}

// Adding a new post
async function addPkg(
  req: NextApiRequest,
  res: NextApiResponse) {
  try {
    let { db } = await connectToDatabase()
    await db.collection('packages').insertOne(JSON.parse(req.body))
    return res.json({
      message: 'Package added successfully',
      success: true,
    })
  } catch (error: any) {
    return res.json({
      message: new Error(error).message,
      success: false,
    })
  }
}

// Updating a post
async function updatePkg(
  req: NextApiRequest,
  res: NextApiResponse) {
  try {
    let { db } = await connectToDatabase()

    await db.collection('packages').updateOne(
      {
        _id: new ObjectId(req.body),
      },
      { $set: { published: true } }
    )

    return res.json({
      message: 'Package updated successfully',
      success: true,
    })
  } catch (error: any) {
    return res.json({
      message: new Error(error).message,
      success: false,
    })
  }
}

// deleting a post
async function deletePkg(
  req: NextApiRequest,
  res: NextApiResponse) {
  try {
    let { db } = await connectToDatabase()

    await db.collection('packages').deleteOne({
      _id: new ObjectId(req.body),
    })

    return res.json({
      message: 'Package deleted successfully',
      success: true,
    })
  } catch (error: any) {
    return res.json({
      message: new Error(error).message,
      success: false,
    })
  }
}
