# 使用官方 Node.js 镜像作为基础镜像
FROM node:18

# 创建工作目录
WORKDIR /usr/src/app

# 安装 Playwright 浏览器依赖
RUN npx playwright install-deps

# 安装 npm 包
COPY package*.json ./
RUN npm install

# 复制源代码
COPY . .

# 暴露输出文件路径（非必需）
EXPOSE 80

# 启动命令
CMD ["node", "index.js"]
