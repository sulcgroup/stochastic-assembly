# C++ implementation of polycubes

## Dependencies
You need Eigen v3.4, HDF5, and Boost installed to build

Install Eigen v3.4 from Eigen website. **Important**: despite what the website may tell you, you DO need to use cmake to install Eigen! Instead, extract the Eigen files to a different directory `mkdir build && cd build`, `cmake ..`, `make install`, and Eigen will be installed.

Download HDFql from the HDFql website and extract to `~/hdfql-[VERSION]`. Make sure to update the hdfql version in `src/CMakeLists.txt`

Install Boost with `sudo apt-get install libboost-all-dev`

CryptoMiniSAT https://www.msoos.org/cryptominisat5/

JSON for Modern C++ https://json.nlohmann.me/

Python bindings require PyBind11. Pybind11 installation is **very** (being polite) finicky to install so be sure to install it using conda as per [these instructions](https://github.com/pybind/pybind11/issues/1379#issuecomment-468933426).

## Build
Build the target binary with cmake:

mkdir build && cd build
cmake -DCMAKE_C_COMPILER=gcc -DCMAKE_CXX_COMPILER=g++ ..
make

You should find the binary in the root of this directory (cpp)

Run ./polycubes --help for more info

To build python bindings, call `./build_pybind.sh` and make sure you have the pybind python module installed.

## Acknowlegements
The original version of Polycubes was developed by Joakim Bohlin of Petr Sulc's Lab at ASU 

This version was built on his by Joshua Evans of Petr Sulc's Lab at ASU

Polycubes employs JSON for Modern C++ by Niels Lohmann https://json.nlohmann.me/