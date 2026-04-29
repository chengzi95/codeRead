//#include<stdio.h>
#include<iostream>//包含头文件 没有.h
using namespace std;//打开标准命名空间
int main01()
{
	int a;
	char b='a';
	//scanf("%d %s", &a, &b);
	//printf("%d %s\n", a, b);

	//>> 输入操作符
	//cin >> a >> b;
	//<<输出操作符 endl 换行
	//cout << a <<" "<< b;

	char* p = &b;

	cout << *p << endl;

	p = (char*)"abc";
	cout << p << endl;//对于 const char* char* 输出字符串（默认规则）
	cout << (void*)p << endl;//其他类型 输出地址

	return 0;


}