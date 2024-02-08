cmake_minimum_required(VERSION 3.10)

project(polycubes LANGUAGES CXX C)
set(CMAKE_BUILD_TYPE Debug)

set (CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_BUILD_TYPE debug)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++20")

# Save binary directly in root folder (cpp)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR})

# Set this to a better directory if you're more organized than I am
set(CMAKE_MODULE_PATH "~/")


add_subdirectory(src)