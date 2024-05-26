import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while generating access and refresh tokens"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { userName, email, fullName, password } = req.body;

  const emptyFields = Object.entries([fullName, userName, email, password])
    .filter(([key, value]) => !value || value.trim() === "")
    .map(([key]) => key);

  if (emptyFields.length > 0) {
    throw new ApiError(
      400,
      "The following fields are required:",
      emptyFields.join(", ")
    );
  }

  const existingUser = await User.findOne({
    $or: [{ email }, { userName }],
  });

  if (existingUser) {
    if (existingUser.email === email && existingUser.userName === userName) {
      throw new ApiError(409, "userName and email already exists");
    } else if (existingUser.email === email) {
      throw new ApiError(409, "email is already used");
    } else if (existingUser.userName === userName) {
      throw new ApiError(409, "userName must be unique");
    }
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Failed to upload avatar on cloudinary");
  }

  const user = await User.create({
    fullName,
    email,
    password,
    avatar: avatar.url,
    userName: userName.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "user not created in db");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { userName, password } = req.body;
  if (!userName) {
    throw new ApiError(400, "username is required");
  }

  const createdUser = await User.findOne({ userName });

  if (!createdUser) {
    throw new ApiError(400, "User does not exist");
  }

  const credentialsVerify = await createdUser.isPasswordCorrect(password);

  if (!credentialsVerify) {
    throw new ApiError(400, "Password is incorrect");
  }

  const { accessToken, refreshToken } = generateAccessAndRefreshToken(
    createdUser._id
  );

  const loggedInUser = await User.findById(createdUser._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

// const logoutUser = asyncHandler(async(req, res) => {
//   await User.findByIdAndUpdate(
//       req.user._id,
//       {
//           $unset: {
//               refreshToken: 1 // this removes the field from document
//           }
//       },
//       {
//           new: true
//       }
//   )

//   const options = {
//       httpOnly: true,
//       secure: true
//   }

//   return res
//   .status(200)
//   .clearCookie("accessToken", options)
//   .clearCookie("refreshToken", options)
//   .json(new ApiResponse(200, {}, "User logged Out"))
// })

export{ registerUser, loginUser };
