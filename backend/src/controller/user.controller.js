import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.models.js";
import jwt from 'jsonwebtoken';
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };

    } catch (error) {
        throw new ApiError(401, "Something went wrong while generating access and refresh Tokens");
    }
};

const registerUser = asyncHandler(async (req, res) => {
    const { fullName, username, email, password, phoneNumber } = req.body
    // console.log(fullName, username)

    if ([fullName, username, email, password, phoneNumber].some((field) => {
        field?.trim() === ""
    })) {
        throw new ApiError(404, "fill your credentials properly")
    }

    const userdetail = await User.findOne({
        $or: [
            { email }, { username }
        ]
    })

    if (userdetail) throw new ApiError(404, 'User is already exists')

    const user = await User.create({
        fullName,
        username: username.toLowerCase(),
        email,
        password,
        phoneNumber
    })

    if (!user) throw new ApiError(404, 'please register again user not created......!')

    const createdUser = await User.findById(user._id).select('-password -refreshToken');

    return res
        .status(200)
        .json(new ApiResponse(200, createdUser, 'user register successfully.....'))
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email) {
        throw new ApiError(401, 'Email not provided');
    }

    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(400, "User with this email does not exist");
    }

    const passwordValid = await user.isLoggin(password);

    if (!passwordValid) {
        throw new ApiError(400, "Password Invalid");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    const option = {
        httpOnly: true,
        secure: true,
        sameSite: 'None', // Allows the cookie to be sent in cross-site requests
        maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
    };

    console.log("Login Details:", loggedInUser);
    console.log(loggedInUser._id.toHexString());

    return res.status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .cookie('ID', loggedInUser._id.toHexString(), option)
        .json(
            new ApiResponse(
                200,
                { user: loggedInUser, accessToken, refreshToken },
                "Logged In successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        { $unset: { refreshToken: 1 } },
        { new: true }
    ).select('-password');

    const option = {
        httpOnly: true,
        secure: true,
        sameSite: 'None', // Allows the cookie to be sent in cross-site requests
        maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
    };

    return res.status(200)
        .clearCookie('accessToken', option)
        .clearCookie('refreshToken', option)
        .json(
            new ApiResponse(200, user, "Successfully logged out")
        );
});

const updatePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

        if (!isPasswordCorrect) {
            return res.status(401).json({ error: 'Old password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        return res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        return next(error);
    }
});

const forgotPassword = asyncHandler(async (req, res) => {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email) {
        throw new ApiError(401, 'Email not provided');
    }
    if (newPassword !== confirmPassword) {
        throw new ApiError(401, 'Passwords do not match');
    }

    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(401, 'User not found');
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json(
        new ApiResponse(200, user, "Password updated successfully")
    );
});

const updateProfileDetails = asyncHandler(async (req, res) => {
    const { fullName, phoneNumber } = req.body;

    if ([fullName, phoneNumber].some((value) => value.trim() === '')) {
        throw new ApiError(403, 'Invalid credentials for update');
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        { $set: { fullName, phoneNumber } },
        { new: true }
    ).select('-password -refreshToken');

    return res.status(200)
        .json(new ApiResponse(200, user, "Successfully updated"));
});


const getUsersWithDetails = asyncHandler(async (req, res) => {
    const userId = req.cookies?.ID ? new mongoose.Types.ObjectId(req.cookies.ID) : null;

    console.log("getUsersWithDetails: ", userId);
    if (!userId) {
        return res.status(400).json(new ApiResponse(400, null, "Invalid user ID"));
    }

    try {
        const getUserDetails = await User.aggregate([
            { $match: { _id: userId } },
            
            {
                $lookup: {
                    from: 'expenses',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'userExpenses'
                }
            },
            {
                $lookup: {
                    from: 'savingsgoals',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'userSavings'
                }
            },
            {
                $addFields: {
                    expenses: '$userExpenses',
                    savingsGoals: '$userSavings'
                }
            },
            {
                $project: {
                    _id: 1,
                    fullName: 1,
                    username: 1,
                    email: 1,
                    phoneNumber: 1,
                    password: 1,
                    refreshToken: 1,
                    expenses: 1,
                    savingsGoals: 1
                }
            }
        ]);

        if (getUserDetails.length === 0) {
            return res.status(404).json(new ApiResponse(404, null, "User not found"));
        }

        return res.status(200).json(
            new ApiResponse(
                200,
                getUserDetails, // Return the first item as getUserDetails is an array
                "Successfully fetched user details with associated categories and expenses"
            )
        );
    } catch (error) {
        console.error('Error fetching user details:', error);
        return res.status(500).json(new ApiResponse(500, null, "An error occurred while fetching user details"));
    }
});

export {
    registerUser,
    loginUser,
    updatePassword,
    forgotPassword,
    logoutUser,
    updateProfileDetails,
    getUsersWithDetails,
}