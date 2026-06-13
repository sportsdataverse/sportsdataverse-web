import { NextApiRequest, NextApiResponse } from "next";

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { connectToDatabase } from '@lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * Fail-closed authorization for mutating requests. Writes (POST/PUT/DELETE)
 * require the `x-api-key` header to match the `PACKAGES_SECRET` env var. If the
 * secret is unset, all writes are denied. GET remains public (read-only).
 */
function isWriteAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.PACKAGES_SECRET;
  if (!secret) return false;
  const provided = req.headers["x-api-key"];
  return typeof provided === "string" && provided === secret;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // switch the methods
  switch (req.method) {
    case 'GET': {
      return getPkgs(req, res)
    }

    case 'POST':
    case 'PUT':
    case 'DELETE': {
      if (!isWriteAuthorized(req)) {
        return res.status(401).json({
          message: 'Unauthorized: a valid x-api-key header is required to modify packages.',
          success: false,
        })
      }
      if (req.method === 'POST') return addPkg(req, res)
      if (req.method === 'PUT') return updatePkg(req, res)
      return deletePkg(req, res)
    }

    default: {
      res.setHeader('Allow', 'GET, POST, PUT, DELETE')
      return res.status(405).json({ message: 'Method not allowed', success: false })
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
